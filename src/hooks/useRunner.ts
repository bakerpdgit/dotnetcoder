import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CompilerDiagnostic, FsChanges, LanguageId, MountedFile, RunnerEvent, RunnerPhase, RunnerRequest,
} from '../types'
import { CONSOLE_SCROLLBACK_LINES, RUNTIME_BASE_PATH, WORKER_BOOT_TIMEOUT_MS } from '../constants'
import { publishEof, publishLine } from '../utils/stdinChannel'
import {
  getStdinChannel, isWorkerRuntimeSupported, postToRuntime, restartWorkerRuntime,
  startWorkerRuntime, stopWorkerRuntime, subscribeToRuntime, unsubscribeFromRuntime,
} from '../utils/runtimeHost'
import { bootOnMainThread, resolveRuntimePreference, setPendingInput } from '../utils/mainThreadRuntime'
import type { BootedRuntime } from '../workers/bootRuntime'
import {
  clearMount, diffMount, isEmptyChanges, mountFiles, walkMount, type MountSnapshot,
} from '../utils/memfsBridge'
import type { CompileResultJson } from '../types'

export type ConsoleChunkKind = 'out' | 'err' | 'system' | 'input'

export interface ConsoleChunk {
  id: number
  kind: ConsoleChunkKind
  text: string
}

export interface RunnerState {
  phase: RunnerPhase
  statusDetail: string
  ready: boolean
  running: boolean
  awaitingInput: boolean
  output: ConsoleChunk[]
  diagnostics: CompilerDiagnostic[]
  fatal: string | null
  /** False when stdin cannot block, i.e. Console.ReadLine() returns null. */
  inputSupported: boolean
  /** Why input is unavailable, when it is. */
  inputUnavailableReason: string | null
  lastExitCode: number | null
}

export interface RunnerControls extends RunnerState {
  run(
    language: LanguageId,
    sources: Array<{ path: string; text: string }>,
    args: string[],
    /** Lines handed to Console.ReadLine() before the user is asked to type. */
    fixedInput: string[],
    /** The filesystem to mount, so the program can open the student's files. */
    files: MountedFile[],
    /** Folder paths, so an empty folder still exists for the program. */
    dirs: string[],
  ): void
  submitInput(line: string): void
  /** Answer the next Console.ReadLine() calls without the user typing again. */
  queueInput(lines: string[]): void
  endInput(): void
  stop(): void
  clearOutput(): void
}

/** SharedArrayBuffer needs cross-origin isolation; without it stdin cannot block. */
function canUseSharedMemory(): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true
}

/**
 * @param onFsChanges Called after a run with whatever the program wrote,
 *   deleted or created. Held in a ref, so the caller does not have to memoise
 *   it and a stale closure cannot swallow a change.
 */
export function useRunner(onFsChanges?: (changes: FsChanges) => void): RunnerControls {
  // Set only in ?runtime=main mode, where there is no worker at all.
  const mainThreadRunnerRef = useRef<BootedRuntime | null>(null)
  const onFsChangesRef = useRef(onFsChanges)
  onFsChangesRef.current = onFsChanges
  // Worker mode answers input requests from here before prompting the user.
  const pendingInputRef = useRef<string[]>([])
  const preference = useMemo(resolveRuntimePreference, [])
  // Where the runtime actually ended up. Starts as the preference, and only
  // changes when `auto` gives up on the worker.
  const [mainThreadMode, setMainThreadMode] = useState(
    preference === 'main' || (preference === 'auto' && !isWorkerRuntimeSupported()),
  )
  const mainThreadModeRef = useRef(mainThreadMode)
  mainThreadModeRef.current = mainThreadMode
  const preferenceRef = useRef(preference)
  preferenceRef.current = preference
  // Set once bootMainThread exists; the event handler is defined before it.
  const fallbackToMainThreadRef = useRef<((reason: string) => void) | null>(null)
  const readyRef = useRef(false)
  const chunkIdRef = useRef(0)

  const [phase, setPhase] = useState<RunnerPhase>('loading-runtime')
  const [statusDetail, setStatusDetail] = useState('')
  const [ready, setReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [awaitingInput, setAwaitingInput] = useState(false)
  const [output, setOutput] = useState<ConsoleChunk[]>([])
  const [diagnostics, setDiagnostics] = useState<CompilerDiagnostic[]>([])
  const [fatal, setFatal] = useState<string | null>(null)
  const [lastExitCode, setLastExitCode] = useState<number | null>(null)

  // Input needs a worker that can block; the UI thread cannot.
  const sharedMemoryAvailable = useMemo(canUseSharedMemory, [])
  const inputSupported = !mainThreadMode && sharedMemoryAvailable

  const append = useCallback((kind: ConsoleChunkKind, text: string) => {
    if (!text) return
    setOutput((previous) => {
      const next = [...previous, { id: chunkIdRef.current++, kind, text }]
      return next.length > CONSOLE_SCROLLBACK_LINES
        ? next.slice(next.length - CONSOLE_SCROLLBACK_LINES)
        : next
    })
  }, [])

  const handleEvent = useCallback((message: RunnerEvent) => {
    switch (message.type) {
      case 'status':
        setPhase(message.phase)
        setStatusDetail(message.detail ?? '')
        break
      case 'ready':
        readyRef.current = true
        setReady(true)
        setPhase('idle')
        break
      case 'stdout': append('out', message.text); break
      case 'stderr': append('err', message.text); break
      case 'diagnostics':
        setDiagnostics(message.diagnostics)
        for (const diagnostic of message.diagnostics.filter(d => d.severity === 'error')) {
          const where = diagnostic.file ? `${diagnostic.file}(${diagnostic.line},${diagnostic.column})` : 'error'
          append('err', `${where}: ${diagnostic.id}: ${diagnostic.message}\n`)
        }
        break
      case 'input-request': {
        // A line supplied up front answers the request without interrupting the
        // user; only fall back to typing once those run out.
        const queued = pendingInputRef.current.shift()
        if (queued !== undefined) {
          append('input', queued + '\n')
          const channel = getStdinChannel()
          if (channel) publishLine(channel, queued)
        } else {
          setAwaitingInput(true)
        }
        break
      }
      case 'fs-changes':
        onFsChangesRef.current?.(message.changes)
        break
      case 'exit':
        setRunning(false)
        setAwaitingInput(false)
        setLastExitCode(message.code)
        break
      case 'fatal':
        setRunning(false)
        setAwaitingInput(false)
        // A worker that dies before it is ready should not strand the IDE:
        // fall back rather than waiting out the boot timeout.
        if (!readyRef.current && !mainThreadModeRef.current && preferenceRef.current === 'auto') {
          fallbackToMainThreadRef.current?.(`the worker runtime failed to start (${message.message})`)
          break
        }
        setFatal(message.message)
        append('err', message.message + '\n')
        break
    }
  }, [append])

  const bootMainThread = useCallback(() => {
    setMainThreadMode(true)
    setFatal(null)
    setPhase('loading-runtime')
    void bootOnMainThread(new URL(RUNTIME_BASE_PATH, location.origin).href, { emit: handleEvent })
      .then((booted) => {
        mainThreadRunnerRef.current = booted
        readyRef.current = true
        setReady(true)
        setPhase('idle')
        setStatusDetail(`${booted.runner.ReferenceCount()} references`)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setPhase('error')
        setFatal(message)
        append('err', message + '\n')
      })
  }, [append, handleEvent])

  const fallbackToMainThread = useCallback((reason: string) => {
    stopWorkerRuntime()
    append('system',
      `\n[${reason}, so it has been restarted on the UI thread]\n` +
      '[typing input is unavailable there — put the program\'s input in the Inputs tab]\n')
    bootMainThread()
  }, [append, bootMainThread])
  fallbackToMainThreadRef.current = fallbackToMainThread

  useEffect(() => {
    if (mainThreadMode) {
      if (preference === 'auto') {
        append('system',
          '[this browser cannot run the .NET runtime on a worker thread]\n' +
          '[put the program\'s input in the Inputs tab — typing in the console needs a worker]\n')
      }
      bootMainThread()
      return undefined
    }

    // The runtime outlives this component (see utils/runtimeHost.ts), so the
    // cleanup only detaches the listener — it must not tear the runtime down.
    subscribeToRuntime(handleEvent)
    if (!startWorkerRuntime(sharedMemoryAvailable)) {
      unsubscribeFromRuntime()
      fallbackToMainThread('this browser cannot run the .NET runtime on a worker thread')
      return undefined
    }

    if (preference !== 'auto') return () => unsubscribeFromRuntime()

    // A worker that never starts must not mean a broken IDE. Give it a
    // generous window — a cold cache on a slow connection is a legitimate
    // couple of dozen seconds — then fall back and say so plainly.
    const fallback = window.setTimeout(() => {
      if (readyRef.current || mainThreadModeRef.current) return
      fallbackToMainThread('the runtime did not start on a worker thread')
    }, WORKER_BOOT_TIMEOUT_MS)

    return () => {
      window.clearTimeout(fallback)
      unsubscribeFromRuntime()
    }
    // Runs once. handleEvent is stable, and the runtime itself is a page-level
    // singleton, so a StrictMode double-mount re-subscribes rather than
    // re-booting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = useCallback((
    language: LanguageId,
    sources: Array<{ path: string; text: string }>,
    args: string[],
    fixedInput: string[],
    files: MountedFile[],
    dirs: string[],
  ) => {
    if (!ready || running) return
    setDiagnostics([])
    setLastExitCode(null)
    setRunning(true)
    pendingInputRef.current = [...fixedInput]
    setPendingInput(fixedInput)

    if (mainThreadMode) {
      const booted = mainThreadRunnerRef.current
      if (!booted) { setRunning(false); return }
      const exports = booted.runner
      // Yield first so the UI can paint "running…": everything below blocks the
      // UI thread until the student's program returns.
      setPhase('compiling')
      window.setTimeout(() => {
        try {
          const compiled = JSON.parse(exports.Compile(language, JSON.stringify(sources))) as CompileResultJson
          setDiagnostics(compiled.diagnostics.map(d => ({
            id: d.id,
            severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
            message: d.message,
            file: d.file,
            line: d.line,
            column: d.column,
            endLine: d.endLine,
            endColumn: d.endColumn,
          })))
          for (const diagnostic of compiled.diagnostics.filter(d => d.severity === 'error')) {
            const where = diagnostic.file ? `${diagnostic.file}(${diagnostic.line},${diagnostic.column})` : 'error'
            append('err', `${where}: ${diagnostic.id}: ${diagnostic.message}\n`)
          }
          if (!compiled.success) { setLastExitCode(1); return }

          // Same mount/diff dance as the worker, just without a message
          // boundary in the middle. See utils/memfsBridge.ts.
          const fs = booted.fs
          const reserved = booted.reservedRootNames
          let before: MountSnapshot | null = null
          if (fs) {
            clearMount(fs, reserved)
            const mounted = mountFiles(fs, files, dirs, reserved)
            if (mounted.skipped.length > 0) {
              append('system', `[not mounted, these names belong to the .NET runtime: ${mounted.skipped.join(', ')}]\n`)
            }
            if (mounted.truncated) {
              append('system', '[the filesystem is too large to mount in full — some files are not visible to your program]\n')
            }
            before = walkMount(fs, reserved)
          }

          setPhase('running')
          try {
            const result = JSON.parse(exports.Run(JSON.stringify(args))) as { exitCode: number; error?: string | null }
            if (result.error) append('err', result.error + '\n')
            setLastExitCode(result.exitCode)
          } finally {
            // Even after a throw: a program that wrote its output and then
            // failed should not lose the output too.
            if (fs && before) {
              const changes = diffMount(before, walkMount(fs, reserved))
              if (!isEmptyChanges(changes)) onFsChangesRef.current?.(changes)
            }
          }
        } catch (error) {
          append('err', (error instanceof Error ? error.message : String(error)) + '\n')
        } finally {
          setRunning(false)
          setPhase('idle')
        }
      }, 0)
      return
    }

    const request: RunnerRequest = { type: 'run', language, sources, args, files, dirs }
    // The file buffers are transferred rather than copied; they come straight
    // from IndexedDB, so nothing else holds a reference to detach.
    if (!postToRuntime(request, files.map(file => file.content))) setRunning(false)
  }, [append, mainThreadMode, ready, running])

  const submitInput = useCallback((line: string) => {
    setAwaitingInput(false)
    append('input', line + '\n')
    const channel = getStdinChannel()
    if (channel) publishLine(channel, line)
  }, [append])

  const queueInput = useCallback((lines: string[]) => {
    // Ahead of anything else waiting: these came from the user just now.
    pendingInputRef.current.unshift(...lines)
  }, [])

  const endInput = useCallback(() => {
    setAwaitingInput(false)
    append('system', '[end of input]\n')
    const channel = getStdinChannel()
    if (channel) publishEof(channel)
  }, [append])

  const stop = useCallback(() => {
    if (mainThreadMode) {
      append('system', '\n[cannot stop a program running on the UI thread — reload the page]\n')
      return
    }
    // WebAssembly cannot be interrupted, so stopping means discarding the
    // worker and booting a fresh runtime. The bundle comes from the HTTP cache,
    // so this takes a second or two rather than a fresh download.
    append('system', '\n[stopped — restarting the .NET runtime]\n')
    setRunning(false)
    setAwaitingInput(false)
    setReady(false)
    setFatal(null)
    setPhase('loading-runtime')
    restartWorkerRuntime(inputSupported)
  }, [append, inputSupported, mainThreadMode])

  const clearOutput = useCallback(() => {
    setOutput([])
    setLastExitCode(null)
  }, [])

  const inputUnavailableReason = inputSupported
    ? null
    : mainThreadMode
      ? 'Typing here needs the worker runtime, which cannot block on the UI thread. Put the program\'s input in the Inputs tab instead — each line answers one Console.ReadLine().'
      : 'Console input is unavailable: this page is not cross-origin isolated, so SharedArrayBuffer is blocked. Serve it with the COOP/COEP headers in _headers.'

  return {
    phase, statusDetail, ready, running, awaitingInput, output, diagnostics,
    fatal, inputSupported, inputUnavailableReason, lastExitCode,
    run, submitInput, queueInput, endInput, stop, clearOutput,
  }
}
