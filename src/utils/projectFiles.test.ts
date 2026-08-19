import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Structural guards on the .NET side of the repo. Both of these were real build
 * breaks, and both are invisible until someone with the SDK installed tries to
 * build — which is exactly the feedback loop these tests shorten.
 */

const RUNTIME_DIR = join(process.cwd(), 'runtime')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'bin' || entry === 'obj') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const allRuntimeFiles = walk(RUNTIME_DIR)
const projectFiles = allRuntimeFiles.filter(f => /\.(csproj|props|targets)$/.test(f))
const asCases = (paths: string[]) => paths.map(path => [relative(process.cwd(), path), path] as [string, string])

const read = (path: string) => readFileSync(path, 'utf8')

/** Strips C# comments so prose that merely mentions an attribute is not a hit. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

describe('MSBuild project files', () => {
  it('finds the runner, its tests and the shared props', () => {
    expect(projectFiles.length).toBeGreaterThanOrEqual(3)
  })

  // XML forbids `--` inside a comment. Writing `dotnet run --project …` in a
  // <!-- --> block makes the csproj unloadable, and MSBuild reports it as a
  // column number rather than saying the comment is illegal.
  it.each(asCases(projectFiles))('%s is well-formed XML with legal comments', (_label, path) => {
    const text = read(path)

    const offenders: string[] = []
    for (const match of text.matchAll(/<!--([\s\S]*?)-->/g)) {
      const body = match[1]
      if (body.includes('--') || body.endsWith('-')) {
        offenders.push(body.split('\n').find(line => line.includes('--')) ?? body)
      }
    }
    expect(offenders, 'XML comments may not contain "--"').toEqual([])

    const parsed = new DOMParser().parseFromString(text, 'application/xml')
    expect(parsed.querySelector('parsererror')?.textContent ?? null).toBeNull()
  })

  it('never pins a target framework', () => {
    for (const path of projectFiles) {
      if (path.endsWith('.props')) continue
      const targetFramework = read(path).match(/<TargetFramework>([^<]+)<\/TargetFramework>/)?.[1]
      // The browser-wasm runtime packs come from the wasm-tools workload of
      // whichever SDK is installed, so the TFM has to follow it.
      expect(targetFramework, `${relative(process.cwd(), path)} pins its target framework`)
        .toBe('$(DotNetCoderTargetFramework)')
    }
  })
})

describe('JavaScript interop stays out of the shared sources', () => {
  // The JS interop source generator ships in the .NET targeting pack, so it
  // runs on *every* target framework and emits code needing AllowUnsafeBlocks.
  // Any interop attribute in a file the desktop test project compiles breaks
  // `npm run test:runtime` with SYSLIB1075 + a wall of CS0227.
  const testProject = join(RUNTIME_DIR, 'DotNetCoder.Runner.Tests', 'DotNetCoder.Runner.Tests.csproj')
  const sharedSources = read(testProject)
    .matchAll(/<Compile Include="\.\.\/DotNetCoder\.Runner\/([^"]+)"/g)
  const shared = [...sharedSources].map(m => join(RUNTIME_DIR, 'DotNetCoder.Runner', m[1]))

  it('the test project shares at least Runner.cs and ConsoleBridge.cs', () => {
    expect(shared.map(f => f.split(/[\\/]/).pop()).sort()).toEqual(['ConsoleBridge.cs', 'Runner.cs'])
  })

  it.each(asCases(shared))('%s carries no interop attributes', (_label, path) => {
    const code = stripComments(read(path))
    expect(/\[JSExport\b/.test(code), 'move it to Exports.cs').toBe(false)
    expect(/\[JSImport\b/.test(code), 'move it to Host.cs').toBe(false)
    expect(code.includes('using System.Runtime.InteropServices.JavaScript')).toBe(false)
  })

  it('the browser-only files still carry the interop surface', () => {
    const exportsCode = stripComments(read(join(RUNTIME_DIR, 'DotNetCoder.Runner', 'Exports.cs')))
    const hostCode = stripComments(read(join(RUNTIME_DIR, 'DotNetCoder.Runner', 'Host.cs')))
    expect(/\[JSExport\b/.test(exportsCode)).toBe(true)
    expect(/\[JSImport\b/.test(hostCode)).toBe(true)
  })

  it('exposes the export class name the worker looks for', () => {
    // src/workers/dotnetRuntime.ts resolves exports.DotNetCoder.Exports
    const exportsSource = read(join(RUNTIME_DIR, 'DotNetCoder.Runner', 'Exports.cs'))
    expect(exportsSource).toContain('namespace DotNetCoder;')
    expect(exportsSource).toMatch(/class Exports\b/)
  })
})
