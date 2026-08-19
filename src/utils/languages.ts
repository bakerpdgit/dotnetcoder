import type { LanguageDef, LanguageId } from '../types'

const CSHARP_TEMPLATE = `using System;

class Program
{
    static void Main()
    {
        Console.WriteLine("Hello, World!");
    }
}
`

const VB_TEMPLATE = `Imports System

Module Program
    Sub Main()
        Console.WriteLine("Hello, World!")
    End Sub
End Module
`

const FSHARP_TEMPLATE = `open System

[<EntryPoint>]
let main argv =
    printfn "Hello, World!"
    0
`

export const LANGUAGES: Record<LanguageId, LanguageDef> = {
  csharp: {
    id: 'csharp',
    label: 'C#',
    monacoId: 'csharp',
    extension: '.cs',
    defaultFileName: 'Program.cs',
    template: CSHARP_TEMPLATE,
  },
  vb: {
    id: 'vb',
    label: 'VB.NET',
    monacoId: 'vb',
    extension: '.vb',
    defaultFileName: 'Program.vb',
    template: VB_TEMPLATE,
  },
  fsharp: {
    id: 'fsharp',
    label: 'F#',
    monacoId: 'fsharp',
    extension: '.fs',
    defaultFileName: 'Program.fs',
    template: FSHARP_TEMPLATE,
    alsoCompile: ['.fsx'],
    experimental: true,
    // Parked until FSharp.Compiler.Service is actually wired up — offering a
    // language that cannot run is worse than not offering it.
    hidden: true,
  },
}

export const LANGUAGE_ORDER: LanguageId[] = ['csharp', 'vb', 'fsharp']

export const LANGUAGE_LIST: LanguageDef[] = LANGUAGE_ORDER.map(id => LANGUAGES[id])

/** The languages offered in the picker. */
export const SELECTABLE_LANGUAGES: LanguageDef[] = LANGUAGE_LIST.filter(language => !language.hidden)

export function isLanguageId(value: string): value is LanguageId {
  return value in LANGUAGES
}

export function getLanguage(id: LanguageId): LanguageDef {
  return LANGUAGES[id]
}

/** Extensions whose files are handed to the compiler for `id`. */
export function compileExtensions(id: LanguageId): string[] {
  const lang = LANGUAGES[id]
  return [lang.extension, ...(lang.alsoCompile ?? [])]
}

/** The language a filename belongs to, or null if it is not a source file. */
export function languageForFile(name: string): LanguageId | null {
  const lower = name.toLowerCase()
  for (const id of LANGUAGE_ORDER) {
    for (const ext of compileExtensions(id)) {
      if (lower.endsWith(ext)) return id
    }
  }
  return null
}

/**
 * Monaco language id for a filename — used when a non-source file (README.md,
 * data.json, …) is opened in the editor so it still gets sensible highlighting.
 */
export function monacoLanguageForFile(name: string): string {
  const byLang = languageForFile(name)
  if (byLang) return LANGUAGES[byLang].monacoId
  const ext = name.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    json: 'json', md: 'markdown', txt: 'plaintext', csv: 'plaintext',
    xml: 'xml', csproj: 'xml', config: 'xml', html: 'html', htm: 'html',
    css: 'css', js: 'javascript', ts: 'typescript', yml: 'yaml', yaml: 'yaml',
    sql: 'sql', razor: 'razor',
  }
  return map[ext] ?? 'plaintext'
}
