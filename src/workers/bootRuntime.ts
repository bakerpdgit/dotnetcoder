/**
 * Boots the .NET WebAssembly runtime and hands back its exports.
 *
 * Shared by both hosts so they cannot drift apart:
 *   - runner.worker.ts       — the default, where Console.ReadLine can block
 *   - utils/mainThreadRuntime.ts — the ?runtime=main fallback
 *
 * Everything host-specific (where output goes, how stdin blocks, how progress
 * is reported) arrives through `callbacks`.
 */
import { resolveRunnerExports, type DotnetHostBuilder, type RunnerExports } from './dotnetRuntime'
import { readReservedRootNames, type EmscriptenFS } from '../utils/memfsBridge'

/**
 * A booted runtime: the compiler surface, plus the filesystem the student's
 * program will see.
 *
 * `fs` is null only if a future runtime bundle stops exposing `Module.FS`. The
 * hosts treat that as "file access is unavailable this session" rather than a
 * fatal error — compiling and running still work, they just cannot see the
 * Files panel.
 */
export interface BootedRuntime {
  runner: RunnerExports
  fs: EmscriptenFS | null
  /**
   * Top-level names that belong to the runtime (`/tmp`, `/proc`, …), captured
   * before anything is mounted. See utils/memfsBridge.ts for why the mount
   * point is `/` and why this has to be read rather than hard-coded.
   */
  reservedRootNames: string[]
}

export interface BootCallbacks {
  /** Named boot step, for progress display and stall diagnosis. */
  onStep(name: string, detail?: string): void
  writeStdout(text: string): void
  writeStderr(text: string): void
  /** Blocking read. Returns null at end of input — and always, where it cannot block. */
  readLine(): string | null
  onReferenceProgress(loaded: number, total: number): void
  /** Turn on the runtime's own verbose logging. */
  verbose: boolean
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} fetching ${url}`)
  return response.json()
}

/** Fetch with a small concurrency limit so 170+ assemblies do not stampede. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await fn(items[cursor++])
    }),
  )
}

export async function bootDotnetRuntime(
  runtimeBaseUrl: string,
  callbacks: BootCallbacks,
): Promise<BootedRuntime> {
  const moduleUrl = `${runtimeBaseUrl}_framework/dotnet.js`

  callbacks.onStep('import dotnet.js')
  let dotnet: DotnetHostBuilder
  try {
    ;({ dotnet } = (await import(/* @vite-ignore */ moduleUrl)) as { dotnet: DotnetHostBuilder })
  } catch (error) {
    throw new Error(
      `Could not load the .NET runtime from ${moduleUrl}.\n\n` +
      'The runtime bundle has not been built yet. From the repository root run:\n' +
      '    npm run build:runtime          (macOS/Linux)\n' +
      '    npm run build:runtime:win      (Windows)\n\n' +
      `Underlying error: ${describeError(error)}`,
    )
  }

  callbacks.onStep('dotnet.create()')
  const api = await dotnet.withDiagnosticTracing(callbacks.verbose).create()

  callbacks.onStep('setModuleImports')
  api.setModuleImports('dotnetcoder', {
    writeStdout: callbacks.writeStdout,
    writeStderr: callbacks.writeStderr,
    readLine: callbacks.readLine,
    // .NET reports progress as free text; it does not get to pick a UI phase.
    reportStatus: (name: string, detail: string) => {
      if (callbacks.verbose) console.log(`[dotnetcoder] runtime: ${name}${detail ? ' — ' + detail : ''}`)
    },
  })

  const config = api.getConfig()
  // The boot config is ~130kB of asset hashes; only dump it when asked.
  if (callbacks.verbose) console.log('[dotnetcoder] runtime config:', JSON.stringify(config))
  const mainAssemblyName = config.mainAssemblyName ?? 'DotNetCoder.Runner'

  callbacks.onStep('getAssemblyExports', mainAssemblyName)
  const runner = resolveRunnerExports(await api.getAssemblyExports(mainAssemblyName))

  callbacks.onStep('Runner.Initialize()')
  runner.Initialize()

  // Roslyn needs metadata to compile against. The published framework is the
  // reference set: the browser already downloaded these URLs to boot the
  // runtime, so this second pass comes out of the HTTP cache.
  callbacks.onStep('fetch references.json')
  const manifest = (await fetchJson(`${runtimeBaseUrl}references.json`)) as { references?: string[] }
  const names = manifest.references ?? []
  if (names.length === 0) {
    throw new Error(`${runtimeBaseUrl}references.json listed no assemblies. Re-run \`npm run build:runtime\`.`)
  }

  callbacks.onStep('load reference assemblies', `${names.length} assemblies`)
  let loaded = 0
  await mapWithConcurrency(names, 8, async (name) => {
    const response = await fetch(`${runtimeBaseUrl}_framework/${name}`)
    if (!response.ok) return
    runner.AddReference(name, new Uint8Array(await response.arrayBuffer()))
    loaded += 1
    if (loaded % 25 === 0 || loaded === names.length) callbacks.onReferenceProgress(loaded, names.length)
  })

  // Roslyn's first compilation pays for its own initialisation — several
  // seconds of it. Spending that here, while the loading indicator is still
  // up, is far better than making the student's first Run feel broken.
  callbacks.onStep('warm up the compiler')
  try {
    runner.Compile('csharp', JSON.stringify([{ path: '/Warmup.cs', text: 'class Warmup { static void Main() { } }' }]))
  } catch (error) {
    // A warm-up failure is not fatal; the real compile will report properly.
    console.warn('[dotnetcoder] compiler warm-up failed', error)
  }

  // The filesystem the program will read and write. Captured here, while the
  // mount is still exactly as the runtime left it, so `reservedRootNames` can
  // never accidentally include something a student's program created.
  const fs = api.Module?.FS ?? null
  const reservedRootNames = fs ? readReservedRootNames(fs) : []

  if (callbacks.verbose) {
    console.log(`[dotnetcoder] ready — ${runner.ReferenceCount()} references`)
    console.log(`[dotnetcoder] filesystem ${fs ? `available, reserved: ${reservedRootNames.join(', ')}` : 'unavailable'}`)
  }
  return { runner, fs, reservedRootNames }
}
