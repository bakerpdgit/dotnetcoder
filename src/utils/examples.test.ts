import { describe, expect, it } from 'vitest'
import {
  EXAMPLES, examplePath, exampleSource, findExample, hasExamples, type ExampleLanguage,
} from './examples'
import { compileExtensions } from './languages'

const LANGUAGES: ExampleLanguage[] = ['csharp', 'vb']

/**
 * True when a line of source leaves a string literal open at its end.
 *
 * Naively counting quotes is not enough: VB starts a comment with an
 * apostrophe, which appears *inside* several of these strings, and C# has
 * character literals. So this walks the line instead, tracking whether it is
 * inside a string, and stops at the first real comment marker.
 */
function endsInsideString(line: string, language: ExampleLanguage): boolean {
  let inString = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (inString) {
      if (char !== '"') continue
      // "" is how both languages put a quote inside a string.
      if (line[i + 1] === '"') { i += 1; continue }
      inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (language === 'vb' && char === "'") return false
    if (language === 'csharp' && char === '/' && line[i + 1] === '/') return false
    // A C# char literal: 'a'. Nothing here escapes, so skip the three.
    if (language === 'csharp' && char === "'") { i += 2; continue }
  }
  return inString
}

describe('the example catalogue', () => {
  it('has unique ids, type names and labels', () => {
    const ids = EXAMPLES.map(e => e.id)
    const names = EXAMPLES.map(e => e.name)
    const labels = EXAMPLES.map(e => e.label)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('looks an example up by id, and puts it at the root', () => {
    const example = findExample('ex1')
    expect(example).toBeDefined()
    expect(examplePath(example!, 'csharp')).toBe('/Example1.cs')
    expect(examplePath(example!, 'vb')).toBe('/Example1.vb')
  })

  it('offers examples for the languages that can actually run', () => {
    expect(hasExamples('csharp')).toBe(true)
    expect(hasExamples('vb')).toBe(true)
    // F# has no compiler in this bundle, so the menu is hidden rather than
    // offering something that cannot work.
    expect(hasExamples('fsharp')).toBe(false)
  })

  it('gives every example a path the compiler will pick up', () => {
    for (const language of LANGUAGES) {
      const extensions = compileExtensions(language)
      for (const example of EXAMPLES) {
        const path = examplePath(example, language)
        expect(extensions.some(ext => path.endsWith(ext)), path).toBe(true)
      }
    }
  })
})

describe.each(EXAMPLES)('$label', (example) => {
  it.each(LANGUAGES)('exists in %s and ends with a newline', (language) => {
    const source = exampleSource(example, language)
    expect(source.length).toBeGreaterThan(0)
    expect(source.endsWith('\n')).toBe(true)
  })

  it('declares the C# type the file is named after, with an entry point', () => {
    const source = exampleSource(example, 'csharp')
    expect(source).toContain(`class ${example.name}`)
    expect(source).toMatch(/static\s+void\s+Main\s*\(/)
  })

  it('declares the VB module the file is named after, with an entry point', () => {
    const source = exampleSource(example, 'vb')
    expect(source).toContain(`Module ${example.name}`)
    expect(source).toMatch(/\n\s*Sub Main\(\)/)
  })

  it('declares exactly one entry point per language', () => {
    // Every source file of the active language is compiled together, so a
    // second Main inside one example would make it fail with CS0017/BC30737
    // the moment it was added.
    expect(exampleSource(example, 'csharp').match(/static\s+void\s+Main\s*\(/g)!.length).toBe(1)
    expect(exampleSource(example, 'vb').match(/\n\s*Sub Main\(\)/g)!.length).toBe(1)
  })

  it.each(LANGUAGES)('closes every %s string literal on its own line', (language) => {
    // These are TypeScript template literals. A `\n` written with one
    // backslash would become a real newline inside a C#/VB string, and the
    // damage is invisible until somebody runs the example.
    for (const [index, line] of exampleSource(example, language).split('\n').entries()) {
      expect(endsInsideString(line, language), `line ${index + 1}: ${line}`).toBe(false)
    }
  })

  it('has no unintended escape left in it', () => {
    // A backslash is a TS escape character but a real operator in VB (integer
    // division) and a real path separator nowhere here, so the only backslashes
    // that should survive are VB's `\`.
    expect(exampleSource(example, 'csharp')).not.toContain('\\')
    for (const match of exampleSource(example, 'vb').match(/\\./g) ?? []) {
      expect(match, 'a lone backslash in VB should only ever be integer division').toMatch(/\\[ 0-9]/)
    }
  })
})

describe('VB integer division survives the template literal', () => {
  it('keeps a single backslash, not an escaped character', () => {
    // The canary for the escaping rule above: written as `\\` in examples.ts,
    // it has to reach the compiler as one backslash.
    expect(exampleSource(findExample('ex1')!, 'vb')).toContain('total \\ 100')
  })
})
