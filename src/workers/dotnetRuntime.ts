/**
 * Minimal typings for the subset of the .NET WebAssembly runtime API we use.
 * The real module is `public/dotnet/_framework/dotnet.js`, produced by
 * `npm run build:runtime`; it is loaded at runtime, never bundled, so there is
 * no @types package to install.
 */

export interface DotnetRuntimeApi {
  setModuleImports(moduleName: string, imports: Record<string, unknown>): void
  getAssemblyExports(assemblyName: string): Promise<Record<string, unknown>>
  getConfig(): { mainAssemblyName?: string }
  runMain?(mainAssemblyName?: string, args?: string[]): Promise<number>
}

export interface DotnetHostBuilder {
  withDiagnosticTracing(enabled: boolean): DotnetHostBuilder
  withExitOnUnhandledError?(): DotnetHostBuilder
  create(): Promise<DotnetRuntimeApi>
}

/** The exports surfaced by the `DotNetCoder.Runner` assembly. */
export interface RunnerExports {
  Initialize(): void
  AddReference(name: string, data: Uint8Array): number
  ReferenceCount(): number
  Compile(language: string, sourcesJson: string): string
  Run(argsJson: string): string
}

/**
 * `getAssemblyExports` returns exports nested by namespace then type, so the
 * `DotNetCoder.Exports` class arrives as `exports.DotNetCoder.Exports`. That
 * class is a thin [JSExport] wrapper over `Runner`; the two are separate
 * because the JS interop source generator runs on every target framework, so
 * keeping Runner.cs interop-free is what lets the desktop test project compile
 * it. Walk the object defensively: a shape mismatch here is the most likely
 * symptom of a stale or mismatched runtime bundle.
 */
export function resolveRunnerExports(exports: Record<string, unknown>): RunnerExports {
  const namespace = exports['DotNetCoder'] as Record<string, unknown> | undefined
  const runner = namespace?.['Exports'] as Partial<RunnerExports> | undefined
  const missing = (['Initialize', 'AddReference', 'Compile', 'Run'] as const)
    .filter(name => typeof runner?.[name] !== 'function')
  if (!runner || missing.length > 0) {
    const found = Object.keys(exports).join(', ') || '(none)'
    throw new Error(
      `The .NET runtime bundle does not expose DotNetCoder.Exports (missing: ${missing.join(', ') || 'namespace'}). ` +
      `Top-level exports were: ${found}. Rebuild the bundle with \`npm run build:runtime\`.`,
    )
  }
  return runner as RunnerExports
}
