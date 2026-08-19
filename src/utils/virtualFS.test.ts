import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  DEFAULT_FS_ID, _resetDbForTests, createEntry, createFilesystem, deleteEntry,
  deleteFilesystem, ensureDefaultFilesystem, ensureFolders, ensureLanguageEntryPoint,
  getAllEntries, getEntryByPath, getSourceFiles, guessMimeType, importFileMapToFs,
  listChildren, listFilesystems, renameEntry,
  renameFilesystem, writeFile,
} from './virtualFS'
import { LANGUAGES } from './languages'

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

beforeEach(() => {
  // A fresh in-memory database per test keeps them independent.
  globalThis.indexedDB = new IDBFactory()
  _resetDbForTests()
})

describe('filesystems', () => {
  it('seeds a default filesystem with a starter file for the chosen language', async () => {
    await ensureDefaultFilesystem('csharp')
    const entry = await getEntryByPath(DEFAULT_FS_ID, '/Program.cs')
    expect(entry?.type).toBe('file')
    expect(new TextDecoder().decode(entry!.content!)).toContain('Hello, World!')
  })

  it('is idempotent — booting twice does not duplicate the starter file', async () => {
    await ensureDefaultFilesystem('csharp')
    await ensureDefaultFilesystem('csharp')
    const roots = await listChildren(DEFAULT_FS_ID, '/')
    expect(roots.filter(e => e.name === 'Program.cs')).toHaveLength(1)
    expect(await listFilesystems()).toHaveLength(1)
  })

  it('creates a starter file when switching to a language with no sources', async () => {
    await ensureDefaultFilesystem('csharp')
    expect(await ensureLanguageEntryPoint(DEFAULT_FS_ID, 'vb')).toBe('/Program.vb')
    const entry = await getEntryByPath(DEFAULT_FS_ID, '/Program.vb')
    expect(new TextDecoder().decode(entry!.content!)).toContain('End Module')
  })

  it('does not create a starter file when the language already has sources', async () => {
    const fs = await createFilesystem('Coursework')
    await createEntry(fs.id, '/', 'Task1.cs', 'file', encode('class A {}'), 'text/x-csharp')
    expect(await ensureLanguageEntryPoint(fs.id, 'csharp')).toBeNull()
    expect(await getEntryByPath(fs.id, '/Program.cs')).toBeNull()
  })

  it('does not seed a starter file for a hidden language', async () => {
    // F# is in the registry but parked out of the picker, so a filesystem should
    // never gain a Program.fs it cannot run.
    expect(LANGUAGES.fsharp.hidden).toBe(true)
    const fs = await createFilesystem('Hidden')
    expect(await ensureLanguageEntryPoint(fs.id, 'fsharp')).toBeNull()
    expect(await getEntryByPath(fs.id, '/Program.fs')).toBeNull()
  })

  it('refuses to rename or delete the default filesystem', async () => {
    await ensureDefaultFilesystem('csharp')
    await expect(renameFilesystem(DEFAULT_FS_ID, 'Nope')).rejects.toThrow(/cannot rename/i)
    await expect(deleteFilesystem(DEFAULT_FS_ID)).rejects.toThrow(/cannot delete/i)
  })

  it('deleting a filesystem removes its entries but leaves others alone', async () => {
    const doomed = await createFilesystem('Doomed', { seedLanguage: 'csharp' })
    const keeper = await createFilesystem('Keeper', { seedLanguage: 'csharp' })
    await deleteFilesystem(doomed.id)
    expect(await getAllEntries(doomed.id)).toHaveLength(0)
    expect(await getAllEntries(keeper.id)).toHaveLength(1)
    expect((await listFilesystems()).map(f => f.name)).toEqual(['Keeper'])
  })
})

describe('entries', () => {
  it('writeFile creates then updates in place', async () => {
    const fs = await createFilesystem('W')
    await writeFile(fs.id, '/notes.txt', encode('one'))
    await writeFile(fs.id, '/notes.txt', encode('two'))
    const all = await getAllEntries(fs.id)
    expect(all).toHaveLength(1)
    expect(new TextDecoder().decode(all[0].content!)).toBe('two')
  })

  it('renames a folder and rewrites every descendant path', async () => {
    const fs = await createFilesystem('R')
    await ensureFolders(fs.id, '/src/models')
    await writeFile(fs.id, '/src/models/Dog.cs', encode('class Dog {}'))
    await renameEntry(fs.id, '/src', 'source')
    const paths = (await getAllEntries(fs.id)).map(e => e.path).sort()
    expect(paths).toEqual(['/source', '/source/models', '/source/models/Dog.cs'])
    const moved = await getEntryByPath(fs.id, '/source/models/Dog.cs')
    expect(moved?.parentPath).toBe('/source/models')
  })

  it('refuses a rename that would collide', async () => {
    const fs = await createFilesystem('C')
    await writeFile(fs.id, '/a.cs', encode(''))
    await writeFile(fs.id, '/b.cs', encode(''))
    await expect(renameEntry(fs.id, '/a.cs', 'b.cs')).rejects.toThrow(/already exists/i)
  })

  it('deleting a folder deletes its contents', async () => {
    const fs = await createFilesystem('D')
    await ensureFolders(fs.id, '/src/deep')
    await writeFile(fs.id, '/src/deep/A.cs', encode(''))
    await writeFile(fs.id, '/keep.cs', encode(''))
    await deleteEntry(fs.id, '/src')
    expect((await getAllEntries(fs.id)).map(e => e.path)).toEqual(['/keep.cs'])
  })

  it('does not delete sibling folders with a shared prefix', async () => {
    const fs = await createFilesystem('P')
    await ensureFolders(fs.id, '/src')
    await ensureFolders(fs.id, '/src2')
    await writeFile(fs.id, '/src2/Keep.cs', encode(''))
    await deleteEntry(fs.id, '/src')
    expect((await getAllEntries(fs.id)).map(e => e.path).sort()).toEqual(['/src2', '/src2/Keep.cs'])
  })
})

describe('source selection', () => {
  it('returns only the active language, sorted, decoded', async () => {
    const fs = await createFilesystem('S')
    await ensureFolders(fs.id, '/lib')
    await writeFile(fs.id, '/lib/Zebra.cs', encode('// zebra'))
    await writeFile(fs.id, '/Program.cs', encode('// program'))
    await writeFile(fs.id, '/Program.vb', encode("' vb"))
    await writeFile(fs.id, '/README.md', encode('# hi'))

    const csharp = await getSourceFiles(fs.id, 'csharp')
    expect(csharp.map(s => s.path)).toEqual(['/lib/Zebra.cs', '/Program.cs'])
    expect(csharp.find(s => s.path === '/Program.cs')!.text).toBe('// program')

    expect((await getSourceFiles(fs.id, 'vb')).map(s => s.path)).toEqual(['/Program.vb'])
  })

  it('picks up .fsx as well as .fs for F#', async () => {
    const fs = await createFilesystem('F')
    await writeFile(fs.id, '/Program.fs', encode(''))
    await writeFile(fs.id, '/extra.fsx', encode(''))
    expect((await getSourceFiles(fs.id, 'fsharp')).map(s => s.path).sort())
      .toEqual(['/Program.fs', '/extra.fsx'].sort())
  })

  // F# is order-dependent: the file holding [<EntryPoint>] must compile last.
  it('puts the F# entry point last regardless of file name', async () => {
    const fs = await createFilesystem('FO')
    await writeFile(fs.id, '/Aardvark.fs', encode('module Aardvark\n'))
    await writeFile(fs.id, '/Main.fs', encode('[<EntryPoint>]\nlet main _ = 0\n'))
    await writeFile(fs.id, '/Zebra.fs', encode('module Zebra\n'))
    expect((await getSourceFiles(fs.id, 'fsharp')).map(s => s.path))
      .toEqual(['/Aardvark.fs', '/Zebra.fs', '/Main.fs'])
  })
})

describe('import', () => {
  it('creates intermediate folders for nested paths', async () => {
    const fs = await createFilesystem('I')
    await importFileMapToFs(fs.id, new Map([['src/models/Dog.cs', encode('class Dog {}')]]))
    expect((await getEntryByPath(fs.id, '/src'))?.type).toBe('folder')
    expect((await getEntryByPath(fs.id, '/src/models'))?.type).toBe('folder')
    expect((await getEntryByPath(fs.id, '/src/models/Dog.cs'))?.type).toBe('file')
  })

  it('overwrites by default and can be told not to', async () => {
    const fs = await createFilesystem('O')
    await writeFile(fs.id, '/a.cs', encode('original'))
    await importFileMapToFs(fs.id, new Map([['a.cs', encode('imported')]]), false)
    expect(new TextDecoder().decode((await getEntryByPath(fs.id, '/a.cs'))!.content!)).toBe('original')
    await importFileMapToFs(fs.id, new Map([['a.cs', encode('imported')]]))
    expect(new TextDecoder().decode((await getEntryByPath(fs.id, '/a.cs'))!.content!)).toBe('imported')
  })
})

describe('mime types', () => {
  it('recognises the .NET source extensions', () => {
    expect(guessMimeType('Program.cs')).toBe('text/x-csharp')
    expect(guessMimeType('Program.VB')).toBe('text/x-vb')
    expect(guessMimeType('Program.fs')).toBe('text/x-fsharp')
    expect(guessMimeType('blob.unknown')).toBe('application/octet-stream')
  })
})
