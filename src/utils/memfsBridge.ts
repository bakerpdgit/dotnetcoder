/**
 * Connects the browser filesystem to the one the student's program sees.
 *
 * The VFS lives in IndexedDB and, until this module existed, never left it: the
 * runner was handed source *text* to compile and nothing else, so a program that
 * opened `data.txt` looked in the .NET runtime's own in-memory filesystem —
 * which boots empty — and threw FileNotFoundException.
 *
 * So each run copies the whole filesystem in, and copies back whatever changed:
 *
 *   mountFiles()  → before the program starts
 *   walkMount()   → snapshot, taken twice
 *   diffMount()   → writes/deletes/new folders, applied to IndexedDB after
 *
 * ## Why the mount point is `/`
 *
 * The runtime's filesystem is Emscripten MEMFS, and the working directory is
 * `/` (verified — `Directory.GetCurrentDirectory()` returns "/"). Mounting the
 * VFS root *at* `/` is what makes both of the forms a student actually writes
 * work, with no shims and no chdir:
 *
 *     File.ReadAllText("data.txt")        // relative to cwd
 *     File.ReadAllText("/data.txt")       // absolute
 *
 * A mount under, say, `/vfs` would need the second form redirected with
 * symlinks, and writes through it would land outside the mount and be lost.
 *
 * The cost is that MEMFS's own top-level directories (`/tmp`, `/home`, `/dev`,
 * `/proc`, `/usr`) share that namespace. They are captured at boot by
 * `readReservedRootNames` and then skipped by everything here, so a program that
 * writes to `/tmp` is simply not mirrored — which is the right answer anyway.
 * The corresponding limitation is that a *VFS* folder named `tmp` cannot be
 * mounted; `mountFiles` reports those rather than silently dropping them.
 */
import { MAX_VFS_MOUNT_BYTES } from '../constants'
import type { FsChanges, MountedFile } from '../types'

export type { FsChanges, MountedFile }

/**
 * The slice of Emscripten's FS API this module uses.
 *
 * The real object is `api.Module.FS`, which the runtime exposes because
 * `dotnet.native.js` does `Module['FS'] = FS`. Typing only what we call keeps
 * the fake in the tests honest and small.
 */
export interface EmscriptenFS {
  mkdir(path: string, mode?: number): unknown
  writeFile(path: string, data: Uint8Array): unknown
  readFile(path: string, opts?: { encoding?: 'binary' | 'utf8' }): Uint8Array
  readdir(path: string): string[]
  stat(path: string): { mode: number; size: number }
  isDir(mode: number): boolean
  isFile(mode: number): boolean
  unlink(path: string): unknown
  rmdir(path: string): unknown
}

/** A point-in-time view of the mount. */
export interface MountSnapshot {
  files: Map<string, Uint8Array>
  dirs: Set<string>
}

/**
 * How deep the walk will go before giving up.
 *
 * MEMFS supports symlinks and `stat` follows them, so a link pointing at one of
 * its own ancestors would otherwise recurse until the stack gives out. Nothing
 * we mount creates links, but the student's program can.
 */
const MAX_DEPTH = 32

export function isEmptyChanges(changes: FsChanges): boolean {
  return changes.writes.length === 0 && changes.deletes.length === 0 && changes.dirs.length === 0
}

/**
 * The top-level names that belong to the runtime rather than the student.
 *
 * Read once, before anything is mounted, rather than hard-coded: the set has
 * changed between .NET versions, and a stale list would either shadow a real
 * directory or leak `/proc` into somebody's Files panel.
 */
export function readReservedRootNames(fs: EmscriptenFS): string[] {
  return fs.readdir('/').filter(name => name !== '.' && name !== '..')
}

function childPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`
}

/** Every path segment of `path`'s parent, outermost first. */
function parentDirs(path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  const dirs: string[] = []
  let acc = ''
  for (const part of parts) {
    acc += `/${part}`
    dirs.push(acc)
  }
  return dirs
}

function mkdirIfMissing(fs: EmscriptenFS, path: string): void {
  try {
    fs.mkdir(path)
  } catch {
    // Already there, which is the common case — `mkdir -p` semantics.
  }
}

/**
 * Walks the mount, skipping the runtime's own directories.
 *
 * Anything that is neither a regular file nor a directory (devices, sockets) is
 * ignored: it has no representation in the VFS and reading it could block.
 */
export function walkMount(fs: EmscriptenFS, reserved: readonly string[]): MountSnapshot {
  const snapshot: MountSnapshot = { files: new Map(), dirs: new Set() }
  const skip = new Set(reserved)

  const visit = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH) return
    let names: string[]
    try {
      names = fs.readdir(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (name === '.' || name === '..') continue
      if (dir === '/' && skip.has(name)) continue
      const path = childPath(dir, name)
      let mode: number
      try {
        mode = fs.stat(path).mode
      } catch {
        continue
      }
      if (fs.isDir(mode)) {
        snapshot.dirs.add(path)
        visit(path, depth + 1)
      } else if (fs.isFile(mode)) {
        try {
          snapshot.files.set(path, fs.readFile(path, { encoding: 'binary' }))
        } catch {
          // Unreadable is treated as absent rather than failing the whole run.
        }
      }
    }
  }

  visit('/', 0)
  return snapshot
}

/**
 * Empties the mount.
 *
 * MEMFS outlives a single run — it is per-runtime, not per-program — so without
 * this, a file the student deleted in the Files panel would still be readable,
 * and output from an earlier run would be mistaken for output from this one.
 */
export function clearMount(fs: EmscriptenFS, reserved: readonly string[]): void {
  const { files, dirs } = walkMount(fs, reserved)
  for (const path of files.keys()) {
    try { fs.unlink(path) } catch { /* nothing left to do about it */ }
  }
  // Deepest first: rmdir only works on an empty directory.
  for (const path of [...dirs].sort((a, b) => b.length - a.length)) {
    try { fs.rmdir(path) } catch { /* as above */ }
  }
}

export interface MountResult {
  /** Names that collide with a runtime directory and could not be mounted. */
  skipped: string[]
  /** True when the filesystem was too large and was mounted only in part. */
  truncated: boolean
  bytes: number
}

/**
 * Copies the VFS into the runtime's filesystem.
 *
 * `dirs` carries folders as well as files so that an empty folder still exists
 * for the program — `Directory.Exists("data")` and writing into a folder the
 * student made in the panel both depend on it.
 */
export function mountFiles(
  fs: EmscriptenFS,
  files: readonly MountedFile[],
  dirs: readonly string[],
  reserved: readonly string[],
): MountResult {
  const skip = new Set(reserved)
  const result: MountResult = { skipped: [], truncated: false, bytes: 0 }

  const topLevel = (path: string): string => path.split('/').filter(Boolean)[0] ?? ''
  const collides = (path: string): boolean => {
    const name = topLevel(path)
    if (!skip.has(name)) return false
    if (!result.skipped.includes(name)) result.skipped.push(name)
    return true
  }

  for (const dir of dirs) {
    if (collides(dir)) continue
    for (const parent of parentDirs(dir)) mkdirIfMissing(fs, parent)
    mkdirIfMissing(fs, dir)
  }

  for (const file of files) {
    if (collides(file.path)) continue
    // Stop rather than exhaust the WASM heap: everything here is copied into
    // linear memory, which cannot grow past a couple of gigabytes and is shared
    // with Roslyn.
    if (result.bytes + file.content.byteLength > MAX_VFS_MOUNT_BYTES) {
      result.truncated = true
      continue
    }
    for (const parent of parentDirs(file.path)) mkdirIfMissing(fs, parent)
    try {
      fs.writeFile(file.path, new Uint8Array(file.content))
      result.bytes += file.content.byteLength
    } catch {
      result.truncated = true
    }
  }

  return result
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
  return true
}

/**
 * What changed between two snapshots.
 *
 * Compares content rather than timestamps or sizes: MEMFS does maintain mtimes,
 * but a program that rewrites a file with the same length in the same
 * millisecond is exactly the case a student hits with a fixed-width record file.
 *
 * The returned buffers are copies, so they survive being transferred out of the
 * worker and detach nothing that MEMFS still owns.
 */
export function diffMount(before: MountSnapshot, after: MountSnapshot): FsChanges {
  const changes: FsChanges = { writes: [], deletes: [], dirs: [] }

  for (const [path, content] of after.files) {
    const previous = before.files.get(path)
    if (previous && sameBytes(previous, content)) continue
    changes.writes.push({ path, content: content.slice().buffer as ArrayBuffer })
  }

  const gone: string[] = []
  for (const path of before.files.keys()) if (!after.files.has(path)) gone.push(path)
  for (const path of before.dirs) if (!after.dirs.has(path)) gone.push(path)

  // Deleting a folder in the VFS deletes everything under it, so reporting the
  // children too would make the write-back delete paths that no longer resolve.
  changes.deletes = gone.filter(path => !gone.some(other => path.startsWith(`${other}/`)))

  for (const path of after.dirs) {
    if (!before.dirs.has(path)) changes.dirs.push(path)
  }

  // Outermost first, so creating them in order never needs a missing parent.
  changes.dirs.sort((a, b) => a.length - b.length)
  return changes
}

/** Every ArrayBuffer in `changes`, for postMessage's transfer list. */
export function changeBuffers(changes: FsChanges): ArrayBuffer[] {
  return changes.writes.map(write => write.content)
}
