import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRunner } from './useRunner'
import { _resetRuntimeHostForTests } from '../utils/runtimeHost'

/**
 * Booting the .NET runtime costs a ~20MB download and calls dotnet.create(),
 * which may only happen once per module scope. React 18 StrictMode mounts
 * effects, unmounts them and mounts them again in development, so a
 * component-owned runtime is booted twice — which downloaded the bundle twice
 * and made the UI-thread runtime fail outright with "Runtime module already
 * loaded". The runtime is therefore a page-level singleton.
 */

class FakeWorker {
  static instances: FakeWorker[] = []
  readonly messages: unknown[] = []
  terminated = false
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  constructor(public url: URL | string, public options?: WorkerOptions) {
    FakeWorker.instances.push(this)
  }

  postMessage(message: unknown): void { this.messages.push(message) }
  terminate(): void { this.terminated = true }
}

function Probe() {
  const runner = useRunner()
  return <output data-testid="phase">{runner.phase}</output>
}

/** Pin a host, disabling the automatic fallback; see resolveRuntimePreference. */
function pinRuntime(host: 'worker' | 'main'): void {
  window.history.replaceState({}, '', `/?runtime=${host}`)
}

const useWorkerRuntime = () => pinRuntime('worker')

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  window.history.replaceState({}, '', '/')
  _resetRuntimeHostForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
  _resetRuntimeHostForTests()
})

describe('useRunner runtime lifecycle', () => {
  it('tries the worker by default, because only it can block on typed input', () => {
    render(<StrictMode><Probe /></StrictMode>)
    expect(FakeWorker.instances).toHaveLength(1)
  })

  it('creates no worker when the UI thread is pinned', () => {
    pinRuntime('main')
    render(<StrictMode><Probe /></StrictMode>)
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('passes the page\'s ?trace flag to the worker, which cannot read it itself', () => {
    window.history.replaceState({}, '', '/?trace=1')
    render(<StrictMode><Probe /></StrictMode>)
    expect(FakeWorker.instances[0].messages[0]).toMatchObject({ type: 'init', verbose: true })
  })

  it('does not ask for verbose logging without ?trace', () => {
    render(<StrictMode><Probe /></StrictMode>)
    expect(FakeWorker.instances[0].messages[0]).toMatchObject({ verbose: false })
  })

  it('boots the runtime exactly once under a StrictMode double-mount', () => {
    useWorkerRuntime()
    render(<StrictMode><Probe /></StrictMode>)

    expect(FakeWorker.instances).toHaveLength(1)
    expect(FakeWorker.instances[0].messages).toHaveLength(1)
    expect(FakeWorker.instances[0].messages[0]).toMatchObject({ type: 'init' })
  })

  it('creates the worker as an ES module worker', () => {
    useWorkerRuntime()
    render(<StrictMode><Probe /></StrictMode>)
    expect(FakeWorker.instances[0].options?.type).toBe('module')
  })

  it('does not terminate the runtime when a component unmounts', () => {
    useWorkerRuntime()
    const { unmount } = render(<StrictMode><Probe /></StrictMode>)
    unmount()
    expect(FakeWorker.instances[0].terminated).toBe(false)
  })

  it('reuses the same runtime across separate mounts', () => {
    useWorkerRuntime()
    const first = render(<StrictMode><Probe /></StrictMode>)
    first.unmount()
    render(<StrictMode><Probe /></StrictMode>)

    expect(FakeWorker.instances).toHaveLength(1)
    expect(FakeWorker.instances[0].messages).toHaveLength(1)
  })

  it('falls back to the UI thread when workers are unavailable', () => {
    vi.stubGlobal('Worker', undefined)
    render(<StrictMode><Probe /></StrictMode>)
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('falls back to the UI thread when a module worker cannot be constructed', () => {
    // A browser that has Worker but rejects { type: 'module' } throws here.
    vi.stubGlobal('Worker', class { constructor() { throw new TypeError('module workers unsupported') } })
    expect(() => render(<StrictMode><Probe /></StrictMode>)).not.toThrow()
  })

  it('replays events that arrived while nothing was subscribed', async () => {
    useWorkerRuntime()
    const first = render(<StrictMode><Probe /></StrictMode>)
    const worker = FakeWorker.instances[0]
    first.unmount()

    // The runtime finishes booting while no component is listening.
    worker.onmessage?.({ data: { type: 'status', phase: 'compiling', detail: 'x' } } as MessageEvent)

    const second = render(<StrictMode><Probe /></StrictMode>)
    expect(second.getByTestId('phase').textContent).toBe('compiling')
  })
})
