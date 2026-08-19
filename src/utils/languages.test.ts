import { describe, expect, it } from 'vitest'
import {
  LANGUAGE_LIST, SELECTABLE_LANGUAGES, compileExtensions, getLanguage, isLanguageId,
  languageForFile, monacoLanguageForFile,
} from './languages'

describe('language registry', () => {
  it('exposes C#, VB.NET and F#', () => {
    expect(LANGUAGE_LIST.map(l => l.id)).toEqual(['csharp', 'vb', 'fsharp'])
  })

  it('marks only F# as experimental', () => {
    expect(LANGUAGE_LIST.filter(l => l.experimental).map(l => l.id)).toEqual(['fsharp'])
  })

  it('offers only the languages that can actually run', () => {
    expect(SELECTABLE_LANGUAGES.map(l => l.id)).toEqual(['csharp', 'vb'])
  })

  it('still recognises a parked language\'s files, so nothing breaks for existing work', () => {
    expect(languageForFile('Program.fs')).toBe('fsharp')
    expect(monacoLanguageForFile('Program.fs')).toBe('fsharp')
  })

  it('validates language ids', () => {
    expect(isLanguageId('csharp')).toBe(true)
    expect(isLanguageId('python')).toBe(false)
  })

  it('compiles .fsx alongside .fs but nothing extra for C#', () => {
    expect(compileExtensions('fsharp')).toEqual(['.fs', '.fsx'])
    expect(compileExtensions('csharp')).toEqual(['.cs'])
  })

  it('maps source files to their language, case-insensitively', () => {
    expect(languageForFile('Program.cs')).toBe('csharp')
    expect(languageForFile('PROGRAM.VB')).toBe('vb')
    expect(languageForFile('script.fsx')).toBe('fsharp')
    expect(languageForFile('notes.md')).toBeNull()
  })

  it('falls back to a sensible Monaco language for non-source files', () => {
    expect(monacoLanguageForFile('Program.cs')).toBe('csharp')
    expect(monacoLanguageForFile('data.json')).toBe('json')
    expect(monacoLanguageForFile('README.md')).toBe('markdown')
    expect(monacoLanguageForFile('mystery.bin')).toBe('plaintext')
  })

  it('gives every language a starter template that names its own entry point', () => {
    for (const language of LANGUAGE_LIST) {
      expect(language.defaultFileName.endsWith(language.extension)).toBe(true)
      expect(getLanguage(language.id).template.length).toBeGreaterThan(0)
    }
  })
})
