/**
 * Makes a module worker look like a host the .NET runtime will actually boot in.
 *
 * `dotnet.js` and `dotnet.runtime.js` both classify their environment with the
 * same four expressions (minified, but this is verbatim logic):
 *
 *   IS_WORKER  = typeof importScripts === 'function'
 *   IS_SIDECAR = IS_WORKER && typeof dotnetSidecar !== 'undefined'
 *   IS_PTHREAD = IS_WORKER && !IS_SIDECAR
 *   IS_SHELL   = !IS_WEB && !IS_NODE
 *
 * A *module* worker satisfies none of them: `importScripts` exists only in
 * classic workers, and there is no `window`. So the runtime decides it is a
 * command-line shell and reaches for APIs a browser does not have.
 *
 * Defining `importScripts` alone is worse, not better: it makes IS_WORKER true
 * while IS_SIDECAR stays false, so IS_PTHREAD becomes true — and the loader
 * then deliberately never resolves its asset promises:
 *
 *   IS_PTHREAD || coreAssetsInMemory.promise_control.resolve()
 *   IS_PTHREAD || (await coreAssetsInMemory.promise, allAssetsInMemory...resolve())
 *
 * because in a real pthread worker the main thread owns that. Meanwhile
 * `onRuntimeInitialized` does `await coreAssetsInMemory.promise`. The result is
 * a runtime that downloads every assembly, logs each one, and then waits
 * forever on a promise nobody will ever settle — with no error.
 *
 * Defining *both* lands on IS_WORKER + IS_SIDECAR, which is .NET's own name for
 * "the runtime lives in a dedicated worker" — exactly this architecture.
 * `dotnetSidecar` is read nowhere else in either file; its only job is to stop
 * the pthread misclassification.
 *
 * Must run before dotnet.js is imported, since the classification happens while
 * that module is evaluated.
 */
export interface DotnetWorkerScope {
  importScripts?: unknown
  dotnetSidecar?: unknown
}

export function prepareDotnetWorkerEnvironment(scope: DotnetWorkerScope): void {
  if (typeof scope.importScripts !== 'function') {
    scope.importScripts = (...urls: string[]) => {
      throw new Error(
        `importScripts(${urls.join(', ')}) is not available in a module worker. ` +
        'It is defined only so the .NET runtime classifies this as a worker rather than a shell.',
      )
    }
  }

  if (typeof scope.dotnetSidecar === 'undefined') {
    scope.dotnetSidecar = true
  }
}

/**
 * The runtime's own classification rules, so a test can assert we satisfy them
 * rather than asserting on our implementation details.
 */
export function classifyDotnetEnvironment(scope: DotnetWorkerScope & { window?: unknown; process?: unknown }) {
  const isNode =
    typeof scope.process === 'object' && scope.process !== null &&
    typeof (scope.process as { versions?: { node?: unknown } }).versions === 'object' &&
    typeof (scope.process as { versions?: { node?: unknown } }).versions?.node === 'string'
  const isWorker = typeof scope.importScripts === 'function'
  const isSidecar = isWorker && typeof scope.dotnetSidecar !== 'undefined'
  const isPthread = isWorker && !isSidecar
  const isWeb = typeof scope.window === 'object' || (isWorker && !isNode)
  const isShell = !isWeb && !isNode
  return { isNode, isWorker, isSidecar, isPthread, isWeb, isShell }
}
