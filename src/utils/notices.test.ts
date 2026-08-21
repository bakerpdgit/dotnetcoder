import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The licence notices have to reach the browser, not just GitHub: MIT's
 * "include this notice in all copies" condition attaches to the distribution,
 * and the distribution here is the served site. public/ is copied verbatim
 * into dist/, so a stale copy there is a silently broken obligation —
 * hence this test rather than trust in remembering to run the script.
 */

const root = join(__dirname, '..', '..')
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8')

describe('third-party notices', () => {
  it('publishes the same notices it commits', () => {
    expect(read('public', 'third-party-notices.txt'))
      .toBe(read('THIRD-PARTY-NOTICES.md'))
  })

  it('names every component whose code is served to the browser', () => {
    const notices = read('THIRD-PARTY-NOTICES.md')
    for (const component of [
      'dotnet/runtime', 'dotnet/roslyn', 'monaco-editor',
      'vscode-codicons', 'facebook/react', 'jszip',
    ]) {
      expect(notices).toContain(component)
    }
  })

  it('states which half of JSZip’s dual licence is taken', () => {
    expect(read('THIRD-PARTY-NOTICES.md')).toMatch(/takes the MIT option/i)
  })

  it('disclaims the Microsoft trademarks the MIT licence does not grant', () => {
    expect(read('THIRD-PARTY-NOTICES.md'))
      .toMatch(/not affiliated with, endorsed by, or sponsored by/i)
  })

  it('propagates Monaco’s own notices', () => {
    expect(read('public', 'monaco-third-party-notices.txt'))
      .toContain('THIRD-PARTY SOFTWARE NOTICES AND INFORMATION')
  })
})
