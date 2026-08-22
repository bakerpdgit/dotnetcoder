import { describe, expect, it } from 'vitest'
import {
  clearMount, diffMount, isEmptyChanges, mountFiles, readReservedRootNames, walkMount,
  type EmscriptenFS,
} from './memfsBridge'
import { MAX_VFS_MOUNT_BYTES } from '../constants'
import type { MountedFile } from '../types'

/**
 * A stand-in for `Module.FS`, the runtime's Emscripten filesystem.
 *
 * It mirrors the behaviour the bridge actually leans on, including the parts
 * that are easy to forget: `mkdir` throws when the directory exists, `rmdir`
 * throws unless the directory is empty, and `readdir` includes "." and "..".
 * The real thing was exercised in a browser while this was written; the fake is
 * what keeps the logic honest afterwards.
 */
function createFakeFs(roots: string[] = ['tmp', 'home', 'dev', 'proc', 'usr']): EmscriptenFS & {
  files: Map<string, Uint8Array>
  dirs: Set<string>
} {
  const files = new Map<string, Uint8Array>()
  const dirs = new Set<string>(['/', ...roots.map(name => `/${name}`)])

  const parentOf = (path: string) => {
    const index = path.lastIndexOf('/')
    return index <= 0 ? '/' : path.substring(0, index)
  }
  const DIR_MODE = 0o040000
  const FILE_MODE = 0o100000

  return {
    files,
    dirs,
    mkdir(path: string) {
      if (dirs.has(path) || files.has(path)) throw new Error(`EEXIST: ${path}`)
      if (!dirs.has(parentOf(path))) throw new Error(`ENOENT: ${parentOf(path)}`)
      dirs.add(path)
    },
    writeFile(path: string, data: Uint8Array) {
      if (!dirs.has(parentOf(path))) throw new Error(`ENOENT: ${parentOf(path)}`)
      files.set(path, new Uint8Array(data))
    },
    readFile(path: string) {
      const found = files.get(path)
      if (!found) throw new Error(`ENOENT: ${path}`)
      return found
    },
    readdir(path: string) {
      if (!dirs.has(path)) throw new Error(`ENOTDIR: ${path}`)
      const names = ['.', '..']
      for (const candidate of [...dirs, ...files.keys()]) {
        if (candidate !== path && parentOf(candidate) === path) {
          names.push(candidate.substring(candidate.lastIndexOf('/') + 1))
        }
      }
      return names
    },
    stat(path: string) {
      if (dirs.has(path)) return { mode: DIR_MODE, size: 0 }
      const found = files.get(path)
      if (!found) throw new Error(`ENOENT: ${path}`)
      return { mode: FILE_MODE, size: found.length }
    },
    isDir: (mode: number) => mode === DIR_MODE,
    isFile: (mode: number) => mode === FILE_MODE,
    unlink(path: string) {
      if (!files.delete(path)) throw new Error(`ENOENT: ${path}`)
    },
    rmdir(path: string) {
      if (!dirs.has(path)) throw new Error(`ENOENT: ${path}`)
      for (const candidate of [...dirs, ...files.keys()]) {
        if (candidate !== path && candidate.startsWith(`${path}/`)) throw new Error(`ENOTEMPTY: ${path}`)
      }
      dirs.delete(path)
    },
  }
}

const RESERVED = ['tmp', 'home', 'dev', 'proc', 'usr']

const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer
const decode = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer)
const file = (path: string, text: string): MountedFile => ({ path, content: encode(text) })

describe('reserved root names', () => {
  it('reads the runtime\'s own directories rather than assuming a fixed list', () => {
    // The set has changed between .NET versions; a hard-coded list would either
    // shadow a real directory or leak /proc into the student's Files panel.
    const fs = createFakeFs(['tmp', 'home', 'somethingnew'])
    expect(readReservedRootNames(fs).sort()).toEqual(['home', 'somethingnew', 'tmp'])
  })
})

describe('mounting the filesystem', () => {
  it('makes a file at the root readable by its plain name', () => {
    const fs = createFakeFs()
    mountFiles(fs, [file('/data.txt', 'hello')], [], RESERVED)
    expect(decode(fs.readFile('/data.txt').slice().buffer)).toBe('hello')
  })

  it('creates the folders a nested file needs', () => {
    const fs = createFakeFs()
    mountFiles(fs, [file('/data/2024/term1.csv', 'a,b')], [], RESERVED)
    expect(fs.dirs.has('/data')).toBe(true)
    expect(fs.dirs.has('/data/2024')).toBe(true)
    expect(decode(fs.readFile('/data/2024/term1.csv').slice().buffer)).toBe('a,b')
  })

  it('creates a folder that holds no files, so Directory.Exists is true', () => {
    const fs = createFakeFs()
    mountFiles(fs, [], ['/output'], RESERVED)
    expect(fs.dirs.has('/output')).toBe(true)
  })

  it('reports a folder whose name collides with a runtime directory', () => {
    const fs = createFakeFs()
    const result = mountFiles(fs, [file('/tmp/notes.txt', 'x')], ['/tmp'], RESERVED)
    expect(result.skipped).toEqual(['tmp'])
    expect(fs.files.has('/tmp/notes.txt')).toBe(false)
  })

  it('stops rather than exhausting the WASM heap on an oversized filesystem', () => {
    const fs = createFakeFs()
    const huge = { path: '/huge.bin', content: new ArrayBuffer(MAX_VFS_MOUNT_BYTES + 1) }
    const result = mountFiles(fs, [huge, file('/small.txt', 'ok')], [], RESERVED)
    expect(result.truncated).toBe(true)
    // The small file still makes it: one enormous file must not cost the rest.
    expect(fs.files.has('/small.txt')).toBe(true)
  })
})

describe('walking the mount', () => {
  it('ignores the runtime\'s own directories', () => {
    const fs = createFakeFs()
    fs.writeFile('/tmp/runtime-scratch', new Uint8Array([1]))
    mountFiles(fs, [file('/mine.txt', 'x')], [], RESERVED)

    const snapshot = walkMount(fs, RESERVED)
    expect([...snapshot.files.keys()]).toEqual(['/mine.txt'])
  })

  it('finds files nested several folders deep', () => {
    const fs = createFakeFs()
    mountFiles(fs, [file('/a/b/c/deep.txt', 'found')], [], RESERVED)
    const snapshot = walkMount(fs, RESERVED)
    expect([...snapshot.files.keys()]).toEqual(['/a/b/c/deep.txt'])
    expect([...snapshot.dirs].sort()).toEqual(['/a', '/a/b', '/a/b/c'])
  })
})

describe('clearing the mount between runs', () => {
  it('removes everything the last run left, including nested folders', () => {
    // MEMFS is per-runtime, not per-program: without this, a file deleted in
    // the Files panel would still be readable on the next run.
    const fs = createFakeFs()
    mountFiles(fs, [file('/a/b/old.txt', 'stale'), file('/root.txt', 'stale')], [], RESERVED)
    clearMount(fs, RESERVED)

    const snapshot = walkMount(fs, RESERVED)
    expect(snapshot.files.size).toBe(0)
    expect(snapshot.dirs.size).toBe(0)
  })

  it('leaves the runtime\'s own directories alone', () => {
    const fs = createFakeFs()
    clearMount(fs, RESERVED)
    expect(fs.dirs.has('/tmp')).toBe(true)
    expect(fs.dirs.has('/proc')).toBe(true)
  })
})

describe('diffing what the program did', () => {
  const mountAndSnapshot = (files: MountedFile[], dirs: string[] = []) => {
    const fs = createFakeFs()
    mountFiles(fs, files, dirs, RESERVED)
    return { fs, before: walkMount(fs, RESERVED) }
  }

  it('reports nothing when the program only reads', () => {
    const { fs, before } = mountAndSnapshot([file('/data.txt', 'hello')])
    expect(isEmptyChanges(diffMount(before, walkMount(fs, RESERVED)))).toBe(true)
  })

  it('reports a new file written into a new folder', () => {
    const { fs, before } = mountAndSnapshot([file('/data.txt', 'hello')])
    fs.mkdir('/out')
    fs.writeFile('/out/result.txt', new TextEncoder().encode('written'))

    const changes = diffMount(before, walkMount(fs, RESERVED))
    expect(changes.dirs).toEqual(['/out'])
    expect(changes.writes.map(w => w.path)).toEqual(['/out/result.txt'])
    expect(decode(changes.writes[0].content)).toBe('written')
  })

  it('reports a file rewritten to the same length', () => {
    // Timestamps and sizes both miss this, and a fixed-width record file is
    // exactly the case a student hits.
    const { fs, before } = mountAndSnapshot([file('/scores.dat', 'AAAA')])
    fs.writeFile('/scores.dat', new TextEncoder().encode('BBBB'))

    const changes = diffMount(before, walkMount(fs, RESERVED))
    expect(changes.writes.map(w => w.path)).toEqual(['/scores.dat'])
    expect(decode(changes.writes[0].content)).toBe('BBBB')
  })

  it('preserves bytes that are not valid text', () => {
    const { fs, before } = mountAndSnapshot([])
    fs.writeFile('/blob.bin', new Uint8Array([0, 1, 250, 255]))

    const changes = diffMount(before, walkMount(fs, RESERVED))
    expect([...new Uint8Array(changes.writes[0].content)]).toEqual([0, 1, 250, 255])
  })

  it('hands back copies, so transferring them detaches nothing MEMFS owns', () => {
    const { fs, before } = mountAndSnapshot([])
    fs.writeFile('/out.txt', new TextEncoder().encode('one'))
    const changes = diffMount(before, walkMount(fs, RESERVED))

    fs.writeFile('/out.txt', new TextEncoder().encode('two'))
    expect(decode(changes.writes[0].content)).toBe('one')
  })

  it('reports a deleted file', () => {
    const { fs, before } = mountAndSnapshot([file('/gone.txt', 'x')])
    fs.unlink('/gone.txt')

    const changes = diffMount(before, walkMount(fs, RESERVED))
    expect(changes.deletes).toEqual(['/gone.txt'])
  })

  it('reports a deleted folder once, not once per file inside it', () => {
    // deleteEntry removes a folder's descendants too, so listing the children
    // as well would make the write-back delete paths that no longer resolve.
    const { fs, before } = mountAndSnapshot([file('/old/a.txt', 'x'), file('/old/b.txt', 'y')])
    fs.unlink('/old/a.txt')
    fs.unlink('/old/b.txt')
    fs.rmdir('/old')

    const changes = diffMount(before, walkMount(fs, RESERVED))
    expect(changes.deletes).toEqual(['/old'])
  })

  it('orders new folders outermost first, so each parent exists when it is made', () => {
    const { fs, before } = mountAndSnapshot([])
    fs.mkdir('/a')
    fs.mkdir('/a/b')
    fs.mkdir('/a/b/c')

    expect(diffMount(before, walkMount(fs, RESERVED)).dirs).toEqual(['/a', '/a/b', '/a/b/c'])
  })
})
