export type Theme = 'dark' | 'light'

// ── Languages ──────────────────────────────────────────────────────────────

export type LanguageId = 'csharp' | 'vb' | 'fsharp'

export interface LanguageDef {
  id: LanguageId
  /** Human label shown in the language picker. */
  label: string
  /** Monaco Editor language id (all three ship in monaco's basic-languages). */
  monacoId: string
  /** Source file extension, including the dot. */
  extension: string
  /** File created when this language is first selected in a filesystem. */
  defaultFileName: string
  /** Starter source for `defaultFileName`. */
  template: string
  /** Extra extensions also fed to the compiler for this language. */
  alsoCompile?: string[]
  /** True when the language needs a second, lazily-fetched compiler bundle. */
  experimental?: boolean
  /**
   * Kept in the registry but not offered in the language picker. Files of this
   * language still get syntax highlighting and are still recognised by
   * `languageForFile`, so nothing breaks for anyone who already has one.
   */
  hidden?: boolean
}

// ── Virtual File System ────────────────────────────────────────────────────

export interface VFSFilesystem {
  id: string
  name: string
  createdAt: number
}

export interface VFSEntry {
  id: string
  fsId: string
  parentPath: string
  path: string
  name: string
  type: 'file' | 'folder'
  content?: ArrayBuffer
  mimeType?: string
  size?: number
  modifiedAt: number
}

export interface VFSFile {
  path: string
  content: ArrayBuffer
  mimeType: string
}

/** A filesystem mutation to mirror onto a connected local OS folder. */
export type LocalFolderSyncOp =
  | { kind: 'write'; path: string; content: ArrayBuffer }
  | { kind: 'mkdir'; path: string }
  | { kind: 'delete'; path: string }
  | { kind: 'rename'; path: string; newName: string }

// ── Compiler diagnostics ───────────────────────────────────────────────────

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export interface CompilerDiagnostic {
  id: string
  severity: DiagnosticSeverity
  message: string
  /** VFS path of the source file, or null for whole-compilation diagnostics. */
  file: string | null
  /** 1-based. */
  line: number
  column: number
  endLine: number
  endColumn: number
}

// ── Runner worker protocol ─────────────────────────────────────────────────

/** Sent from the UI to the runner worker. */
export type RunnerRequest =
  | {
      type: 'init'
      /** Absolute URL of the folder holding dotnet.js (…/dotnet/). */
      runtimeBaseUrl: string
      /** SharedArrayBuffer used for the blocking stdin bridge; null disables input. */
      sab: SharedArrayBuffer | null
      /**
       * Turn on the runtime's own verbose logging.
       *
       * This has to be passed in rather than read from the URL inside the
       * worker: a worker's `location` is its own script URL, so the page's
       * ?trace=1 is simply not visible there.
       */
      verbose: boolean
    }
  | {
      type: 'run'
      language: LanguageId
      sources: Array<{ path: string; text: string }>
      /** Extra command-line arguments passed to Main. */
      args: string[]
    }
  | { type: 'cancel' }

/** Sent from the runner worker back to the UI. */
export type RunnerEvent =
  | { type: 'status'; phase: RunnerPhase; detail?: string }
  | { type: 'ready' }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'diagnostics'; diagnostics: CompilerDiagnostic[] }
  | { type: 'input-request'; prompt: string }
  | { type: 'exit'; code: number }
  | { type: 'fatal'; message: string }

export type RunnerPhase =
  | 'loading-runtime'
  | 'loading-references'
  | 'ready'
  | 'compiling'
  | 'running'
  | 'idle'
  | 'error'

/** Shape of the JSON returned by the .NET `CompileAndRun` export. */
export interface CompileResultJson {
  success: boolean
  exitCode: number
  diagnostics: Array<{
    id: string
    severity: string
    message: string
    file: string | null
    line: number
    column: number
    endLine: number
    endColumn: number
  }>
  /** Unhandled exception text, if the program threw. */
  error?: string | null
}
