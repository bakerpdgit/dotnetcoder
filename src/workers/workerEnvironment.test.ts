import { describe, expect, it } from 'vitest'
import {
  classifyDotnetEnvironment, prepareDotnetWorkerEnvironment, type DotnetWorkerScope,
} from './workerEnvironment'

/**
 * These assert against the .NET runtime's *own* classification rules, copied
 * from dotnet.js / dotnet.runtime.js, rather than against our implementation.
 * The failure they guard against is silent: a misclassified environment makes
 * the runtime download every assembly and then wait forever on a promise the
 * loader has deliberately decided not to resolve.
 */

/** A module worker: no `window`, and no `importScripts` (classic workers only). */
const bareModuleWorker = (): DotnetWorkerScope => ({})

describe('how the .NET runtime classifies a module worker', () => {
  it('mistakes an untouched module worker for a command-line shell', () => {
    const scope = bareModuleWorker()
    const env = classifyDotnetEnvironment(scope)
    expect(env.isWorker).toBe(false)
    expect(env.isShell).toBe(true)
  })

  it('mistakes a worker for a pthread if only importScripts is defined', () => {
    // This was the state after the first attempted fix: better than "shell",
    // still broken — the loader never resolves coreAssetsInMemory for a
    // pthread, because the main thread is supposed to own it.
    const scope: DotnetWorkerScope = { importScripts: () => {} }
    const env = classifyDotnetEnvironment(scope)
    expect(env.isWorker).toBe(true)
    expect(env.isPthread).toBe(true)
  })
})

describe('prepareDotnetWorkerEnvironment', () => {
  it('lands on worker + sidecar, which is the configuration that boots', () => {
    const scope = bareModuleWorker()
    prepareDotnetWorkerEnvironment(scope)
    const env = classifyDotnetEnvironment(scope)

    expect(env.isWorker).toBe(true)
    expect(env.isSidecar).toBe(true)
    expect(env.isPthread, 'a pthread never gets its asset promises resolved').toBe(false)
    expect(env.isShell, 'a shell reaches for APIs a browser does not have').toBe(false)
    expect(env.isWeb).toBe(true)
  })

  it('defines importScripts as a function that explains itself if called', () => {
    const scope = bareModuleWorker()
    prepareDotnetWorkerEnvironment(scope)
    expect(() => (scope.importScripts as (u: string) => void)('a.js'))
      .toThrow(/module worker/)
  })

  it('leaves a real classic worker alone', () => {
    const realImportScripts = () => {}
    const scope: DotnetWorkerScope = { importScripts: realImportScripts }
    prepareDotnetWorkerEnvironment(scope)
    expect(scope.importScripts).toBe(realImportScripts)
    expect(classifyDotnetEnvironment(scope).isSidecar).toBe(true)
  })

  it('is idempotent', () => {
    const scope = bareModuleWorker()
    prepareDotnetWorkerEnvironment(scope)
    const first = scope.importScripts
    prepareDotnetWorkerEnvironment(scope)
    expect(scope.importScripts).toBe(first)
  })
})
