/// <reference lib="webworker" />
/**
 * Runs student code on a worker thread.
 *
 * The worker exists for one reason: Console.ReadLine() has to *block*. .NET
 * calls back into JavaScript synchronously, and that JavaScript parks on
 * Atomics.wait until the UI thread writes a line into the SharedArrayBuffer.
 * Atomics.wait is forbidden on the main thread, so the runtime has to live
 * here. That in turn requires the page to be cross-origin isolated — see the
 * COOP/COEP headers in vite.config.ts, server.mjs and _headers.
 *
 * If the runtime cannot start here, ?runtime=main boots it on the UI thread
 * instead (see utils/mainThreadRuntime.ts): no blocking input, but it isolates
 * whether the worker is the problem.
 */
import type { CompileResultJson, RunnerEvent, RunnerRequest } from '../types'
import { awaitLine, createStdinChannel, markWaiting, type StdinChannel } from '../utils/stdinChannel'
import { WORKER_STALL_WARNING_MS } from '../constants'
import { bootDotnetRuntime, describeError } from './bootRuntime'
import type { RunnerExports } from './dotnetRuntime'
import { prepareDotnetWorkerEnvironment, type DotnetWorkerScope } from './workerEnvironment'

const ctx = self as unknown as DedicatedWorkerGlobalScope

let runner: RunnerExports | null = null
let stdin: StdinChannel | null = null
let initPromise: Promise<void> | null = null

function post(event: RunnerEvent): void {
  ctx.postMessage(event)
}

/**
 * Boot progress, mirrored to the browser console as well as the UI.
 *
 * Booting the .NET runtime is a long chain of async steps inside dotnet.js, and
 * if one of them never settles the symptom is simply that nothing happens. The
 * step name makes a stall self-describing, and the watchdog turns "it hangs"
 * into "it stalled at X after N seconds".
 */
let currentStep = 'starting'
let stepStartedAt = 0
let watchdog: ReturnType<typeof setTimeout> | undefined
let verboseLogging = false

// Must happen before dotnet.js is imported: the runtime classifies its
// environment while that module is evaluated. See workerEnvironment.ts for what
// each flag means and why both globals are needed.
prepareDotnetWorkerEnvironment(ctx as unknown as DotnetWorkerScope)

function step(name: string, detail = ''): void {
  if (watchdog !== undefined) clearTimeout(watchdog)
  currentStep = name
  stepStartedAt = Date.now()
  if (verboseLogging) console.log(`[dotnetcoder] ${name}${detail ? ': ' + detail : ''}`)
  post({ type: 'status', phase: 'loading-runtime', detail: name })
  watchdog = setTimeout(() => {
    const seconds = Math.round((Date.now() - stepStartedAt) / 1000)
    const message =
      `The .NET runtime has been stuck at "${currentStep}" for ${seconds} seconds.\n` +
      'Add ?trace=1 for the runtime\'s own verbose log, or ?runtime=main to run it\n' +
      'on the UI thread instead (no typed input there).\n'
    console.warn('[dotnetcoder] ' + message)
    post({ type: 'stderr', text: message })
  }, WORKER_STALL_WARNING_MS)
}

function stepDone(): void {
  if (watchdog !== undefined) clearTimeout(watchdog)
  watchdog = undefined
}

// A rejected promise inside dotnet.js would otherwise vanish silently and look
// exactly like a hang.
ctx.addEventListener('unhandledrejection', (event) => {
  post({ type: 'fatal', message: `Unhandled error while at "${currentStep}": ${describeError((event as PromiseRejectionEvent).reason)}` })
})

ctx.addEventListener('error', (event) => {
  post({ type: 'fatal', message: `Worker error while at "${currentStep}": ${(event as ErrorEvent).message}` })
})

// ── stdin bridge ───────────────────────────────────────────────────────────

/**
 * Called synchronously from .NET. Blocks this thread until the UI supplies a
 * line or signals end-of-input, then returns the line (null at EOF).
 */
function readLineBlocking(): string | null {
  if (!stdin) return null
  markWaiting(stdin)
  post({ type: 'input-request', prompt: '' })
  return awaitLine(stdin)
}

// ── boot ───────────────────────────────────────────────────────────────────

async function initialise(
  runtimeBaseUrl: string,
  sab: SharedArrayBuffer | null,
  verbose: boolean,
): Promise<void> {
  if (sab) stdin = createStdinChannel(sab)

  runner = await bootDotnetRuntime(runtimeBaseUrl, {
    verbose,
    onStep: step,
    writeStdout: (text: string) => post({ type: 'stdout', text }),
    writeStderr: (text: string) => post({ type: 'stderr', text }),
    readLine: readLineBlocking,
    onReferenceProgress: (loaded, total) =>
      post({ type: 'status', phase: 'loading-references', detail: `${loaded}/${total}` }),
  })

  stepDone()
  post({ type: 'status', phase: 'ready', detail: `${runner.ReferenceCount()} references` })
  post({ type: 'ready' })
}

// ── compile + run ──────────────────────────────────────────────────────────

function compileAndRun(request: Extract<RunnerRequest, { type: 'run' }>): void {
  if (!runner) {
    post({ type: 'fatal', message: 'The .NET runtime is not ready yet.' })
    return
  }

  post({ type: 'status', phase: 'compiling' })

  let compiled: CompileResultJson
  try {
    compiled = JSON.parse(runner.Compile(request.language, JSON.stringify(request.sources))) as CompileResultJson
  } catch (error) {
    post({ type: 'fatal', message: `The compiler failed unexpectedly: ${describeError(error)}` })
    return
  }

  post({
    type: 'diagnostics',
    diagnostics: compiled.diagnostics.map(d => ({
      id: d.id,
      severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
      message: d.message,
      file: d.file,
      line: d.line,
      column: d.column,
      endLine: d.endLine,
      endColumn: d.endColumn,
    })),
  })

  if (!compiled.success) {
    post({ type: 'status', phase: 'idle' })
    post({ type: 'exit', code: 1 })
    return
  }

  post({ type: 'status', phase: 'running' })

  let result: { exitCode: number; error?: string | null }
  try {
    result = JSON.parse(runner.Run(JSON.stringify(request.args))) as { exitCode: number; error?: string | null }
  } catch (error) {
    post({ type: 'fatal', message: `The program could not be started: ${describeError(error)}` })
    return
  }

  if (result.error) post({ type: 'stderr', text: result.error + '\n' })
  post({ type: 'status', phase: 'idle' })
  post({ type: 'exit', code: result.exitCode })
}

// ── message pump ───────────────────────────────────────────────────────────

ctx.onmessage = (event: MessageEvent<RunnerRequest>) => {
  const request = event.data
  switch (request.type) {
    case 'init':
      if (initPromise) return
      verboseLogging = request.verbose
      initPromise = initialise(request.runtimeBaseUrl, request.sab, request.verbose).catch((error: unknown) => {
        stepDone()
        console.error(`[dotnetcoder] failed at "${currentStep}"`, error)
        post({ type: 'status', phase: 'error' })
        post({ type: 'fatal', message: `Failed at "${currentStep}": ${describeError(error)}` })
      })
      return
    case 'run':
      compileAndRun(request)
      return
    case 'cancel':
      // Nothing to do: WebAssembly cannot be interrupted from outside. The UI
      // terminates and recreates this worker instead.
      return
  }
}
