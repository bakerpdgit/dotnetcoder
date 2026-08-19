/**
 * Boots the .NET runtime on the UI thread instead of a worker.
 *
 * This is the ?runtime=main fallback. It exists for two reasons:
 *
 *  - Diagnosis. If the runtime starts here but not in the worker, the worker is
 *    the problem; if it stalls in both, the problem is the bundle or its config.
 *  - Availability. A page served without the COOP/COEP headers has no
 *    SharedArrayBuffer, so the worker buys nothing anyway.
 *
 * The trade-off is real and not hideable: Console.ReadLine() cannot block on
 * the UI thread, so it returns null immediately, and a student's infinite loop
 * freezes the tab until it is closed.
 */
import { bootDotnetRuntime } from '../workers/bootRuntime'
import type { RunnerExports } from '../workers/dotnetRuntime'
import type { RunnerEvent } from '../types'

export interface MainThreadHost {
  emit(event: RunnerEvent): void
}

/**
 * Booting is a page-level singleton. dotnet.create() may only be called once
 * per module scope — a second call fails with "Runtime module already loaded" —
 * and React 18 StrictMode invokes effects twice in development, so an unguarded
 * boot is guaranteed to hit that in dev.
 */
let bootPromise: Promise<RunnerExports> | null = null

export function bootOnMainThread(
  runtimeBaseUrl: string,
  host: MainThreadHost,
): Promise<RunnerExports> {
  if (bootPromise) return bootPromise
  const verbose = isTracing()
  bootPromise = bootDotnetRuntime(runtimeBaseUrl, {
    verbose,
    onStep: (name) => {
      if (verbose) console.log(`[dotnetcoder] ${name}`)
      host.emit({ type: 'status', phase: 'loading-runtime', detail: name })
    },
    writeStdout: (text) => host.emit({ type: 'stdout', text }),
    writeStderr: (text) => host.emit({ type: 'stderr', text }),
    // Nothing can block here, so a line can only come from input supplied
    // before the run started. Returning null means end of input.
    readLine: takePendingInput,
    onReferenceProgress: (loaded, total) =>
      host.emit({ type: 'status', phase: 'loading-references', detail: `${loaded}/${total}` }),
  })
  return bootPromise
}

/** Test hook — drops the singleton so each test starts clean. */
export function _resetMainThreadRuntimeForTests(): void {
  bootPromise = null
}

/**
 * Where the runtime should run.
 *
 * The worker is strongly preferred: it is the only place Console.ReadLine() can
 * block, so it is the only place a student can type input while a program is
 * waiting. But the worker has failed to start before, and a broken worker must
 * not mean a broken IDE — so `auto` tries the worker and falls back to the UI
 * thread if it does not come up.
 *
 * `?runtime=worker` and `?runtime=main` pin one host, with no fallback, which
 * is what you want when investigating which of them is at fault.
 */
export type RuntimePreference = 'auto' | 'worker' | 'main'

export function resolveRuntimePreference(): RuntimePreference {
  const requested = new URLSearchParams(location.search).get('runtime')
  return requested === 'worker' ? 'worker' : requested === 'main' ? 'main' : 'auto'
}

/** ?trace=1 on the page URL turns on the runtime's own verbose logging. */
export function isTracing(): boolean {
  return new URLSearchParams(location.search).get('trace') === '1'
}

/**
 * Lines waiting to be handed to Console.ReadLine().
 *
 * The UI thread cannot block, so interactive typing is impossible here. Instead
 * the input is supplied up front and consumed line by line — the same model the
 * desktop test harness uses, and the one pythoncoder calls "fixed inputs".
 */
let pendingInput: string[] = []

export function setPendingInput(lines: string[]): void {
  pendingInput = [...lines]
}

function takePendingInput(): string | null {
  return pendingInput.length > 0 ? pendingInput.shift()! : null
}
