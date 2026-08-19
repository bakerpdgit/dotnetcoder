import { describe, expect, it } from 'vitest'
import { resolveRunnerExports } from './dotnetRuntime'

const complete = {
  DotNetCoder: {
    Exports: {
      Initialize: () => {},
      AddReference: () => 1,
      ReferenceCount: () => 1,
      Compile: () => '{}',
      Run: () => '{}',
    },
  },
}

describe('resolveRunnerExports', () => {
  it('reaches through the namespace nesting', () => {
    expect(resolveRunnerExports(complete).Compile('csharp', '[]')).toBe('{}')
  })

  it('explains what is wrong when the bundle is missing', () => {
    expect(() => resolveRunnerExports({})).toThrow(/npm run build:runtime/)
  })

  it('names the methods that are missing when the bundle is stale', () => {
    const stale = { DotNetCoder: { Exports: { Initialize: () => {} } } }
    expect(() => resolveRunnerExports(stale)).toThrow(/AddReference, Compile, Run/)
  })
})
