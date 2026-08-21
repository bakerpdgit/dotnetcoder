# dotnetcoder

A browser-based .NET IDE. Students write C# or VB.NET, press Run, and the code
is compiled and executed **entirely in their browser** — no server, no install,
nothing to set up on the machine they are sitting at.

It is the .NET counterpart to [pythoncoder](https://github.com/bakerpdgit/pythoncoder)
and follows the same shape: Monaco editor, an IndexedDB virtual filesystem with
multiple named workspaces, and the ability to connect a real folder on disk.

## How it works

The same trick Pyodide uses. Nobody compiles CPython in their browser — someone
compiles it to WebAssembly once, and the app fetches the result. Here:

| | |
|---|---|
| **Once, at build time** | The .NET SDK publishes the Mono/.NET WebAssembly runtime plus the Roslyn compiler assemblies into `public/dotnet/`. |
| **Every visit, in the browser** | Those static files are downloaded (and then cached). Roslyn *runs inside WebAssembly* and compiles the student's source to IL in memory. The .NET runtime executes that IL. |

So the .NET SDK is a **build-time dependency for you**, never for your students.
This is the same architecture as BlazorRepl, Try .NET and DotNetFiddle's
client-side mode.

```
 browser tab
 ├─ React + Monaco (main thread)          ← editor, filesystem, console UI
 └─ runner.worker.ts (worker thread)
     └─ .NET WASM runtime
         ├─ Roslyn  (Microsoft.CodeAnalysis.CSharp / .VisualBasic)
         └─ DotNetCoder.Runner            ← compiles, loads and invokes the IL
```

The runtime lives on a **worker thread** for one reason: `Console.ReadLine()`
has to block. .NET calls synchronously into JavaScript, which parks on
`Atomics.wait` until the UI writes a line into a `SharedArrayBuffer`.
`Atomics.wait` is illegal on the main thread, so the runtime cannot live there.
That in turn requires the page to be **cross-origin isolated** — see
[Required headers](#required-headers).

## Getting started

### 1. Install the prerequisites

* **Node 20+**
* **.NET SDK 9 or newer** — <https://dotnet.microsoft.com/download>
* The WebAssembly workload for that SDK:

  ```
  dotnet workload install wasm-tools
  ```

The runner targets whichever SDK you have: the build script reads
`dotnet --version` and sets `DotNetCoderTargetFramework` to match, so .NET 10
builds `net10.0` and .NET 9 builds `net9.0`. `runtime/Directory.Build.props`
holds the default and the Roslyn version if you ever need to pin them.

### 2. Build the .NET runtime bundle

This is the step that produces `public/dotnet/`. It takes a few minutes the
first time and only needs repeating when `runtime/` changes.

```powershell
# Windows
npm install
npm run build:runtime:win
```

```bash
# macOS / Linux
npm install
npm run build:runtime
```

The script runs the compiler tests first, publishes the runner for
`browser-wasm`, copies the output into `public/dotnet/`, and writes
`public/dotnet/references.json`.

### 3. Run the IDE

```
npm run dev          # http://localhost:3000, with hot reload
```

```
npm run build && npm start    # production build served by server.mjs
```

**In VS Code:** press <kbd>F5</kbd> with *Run in browser (dev server)* selected.
That starts Vite, waits for it to be ready, and opens Chrome with the debugger
attached, so breakpoints work in `.tsx` files and in the runner worker. The
other configurations serve the production build, debug the Vitest suite, and
break into `Runner.cs` on desktop .NET (that last one needs the C# extension).

### Don't want to install the .NET SDK?

The GitHub Actions workflow in `.github/workflows/build.yml` builds the bundle
on every push. Download the `dotnet-runtime-bundle` artifact from the run and
unzip it into `public/dotnet/`; `npm run dev` will then work normally.

## Using it

* **Language picker** — C# and VB.NET. Switching to a language with no source
  files in the current workspace creates a starter file for it.
* **Run (Ctrl+Enter or F5)** — compiles *every* source file of the active
  language in the current filesystem, so projects can be split across files.
* **Troubleshooting the runtime** — the status line names the boot step in
  flight, and the browser console logs each one with a `[dotnetcoder]` prefix.
  `?trace=1` turns on the runtime's own verbose logging. `?runtime=main` boots
  the runtime on the UI thread instead of the worker: input stops working and a
  runaway program freezes the tab, but it isolates whether the worker is at
  fault.
* **Restart** — WebAssembly cannot be interrupted from outside, so stopping a
  runaway program means discarding the worker and booting a fresh runtime. The
  bundle comes from cache, so it takes a second or two.
* **Console** — `Console.WriteLine` output and `Console.Error` in red.
* **Inputs tab** — one line per `Console.ReadLine()`, supplied before the run.
  This is how input works by default, and it is the reliable way to give a
  program its data. Lines are consumed from the top on every run.
* **Typed input** — the caret appears in the console itself when the program
  calls `Console.ReadLine()` and the Inputs tab has run out. Pasting several
  lines behaves like a terminal: each newline answers one `ReadLine()`, and a
  final line without a newline stays at the prompt. **End input** (or Ctrl+D)
  closes stdin so `ReadLine()` returns `null`. Needs the worker runtime, since
  only there can the runtime block; a browser without workers falls back to the
  UI thread and says so.
* **Problems tab** — Roslyn diagnostics; clicking one jumps to the position in
  the editor, which also gets red squiggles.
* **Args** — passed to `Main(string[] args)`. Quoted arguments are honoured.
* **Filesystems** — each is an independent workspace in IndexedDB. Create, rename,
  delete, import a `.zip` as a new filesystem, or download one as a `.zip`.
* **Connect a folder** — reads a real folder from disk into a new filesystem and
  mirrors every later change back to it (Chrome/Edge only; the File System
  Access API does not exist in Firefox or Safari, where upload/download still
  work). There is no file watching: use **Reload from the connected folder** to
  pick up outside edits. Permissions reset on page reload.

### Implicit usings

C# compiles with the same implicit global usings the .NET SDK generates for a
console project (`System`, `System.Linq`, `System.Collections.Generic`, …), so
top-level statements like `Console.WriteLine("hi");` work and code written in
Visual Studio behaves the same here. If you would rather students always write
`using System;` themselves, remove `ImplicitUsingsSource` from
`runtime/DotNetCoder.Runner/Runner.cs`.

VB.NET compiles with the global imports and `Option Infer On` / `Option Strict
Off` defaults of a `dotnet new console -lang VB` project.

## Required headers

`SharedArrayBuffer` needs cross-origin isolation on **every** response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
Origin-Agent-Cluster: ?1
```

These are set in three places, which must stay in step:

* `vite.config.ts` — dev and preview servers
* `server.mjs` — the production Node server
* `public/_headers` — Cloudflare Pages (copied to `dist/_headers` at build time)

Without them the editor still works, but the console input box is replaced by a
warning and `Console.ReadLine()` returns `null`. `test/e2e/smoke.spec.ts` asserts
`crossOriginIsolated === true`, so a regression fails the build rather than
silently degrading.

## Bundle size

The runtime bundle is roughly **20–25 MB uncompressed**, served compressed and
then cached by the browser. It is large because trimming is disabled: the IL
trimmer cannot see through Roslyn, so it would strip exactly the framework a
student's code needs.

Two knobs if that matters on your network:

* `public/dotnet/references.json` is a plain list. Trimming it to the assemblies
  your students actually use (System.Private.CoreLib, System.Runtime,
  System.Console, System.Linq, System.Collections, …) cuts the *second* pass —
  though not the runtime download itself, and any assembly you remove becomes
  unavailable to student code.
* `dotnet publish -p:TrimRuntime=true` turns trimming back on. Expect
  `MissingMethodException` at runtime for anything the trimmer could not see;
  this is not recommended without careful testing.

Make sure your host serves the bundle with compression and long-lived cache
headers. Cloudflare Pages does both by default.

## Adding F#

F# is currently **hidden from the language picker** (`hidden: true` in
`src/utils/languages.ts`). The registry entry, the `.fs`/`.fsx` handling and the
compile-order rule all remain, so unhiding it is a one-line change once the
compiler is actually wired up.


F# appears in the language picker so files can be written and highlighted, but
pressing Run reports that it is not in the bundle. C# and VB.NET share the
Roslyn compiler, so they cost one dependency between them; F# needs
`FSharp.Compiler.Service`, which is a different compilation model and roughly
30 MB more.

The seam is in `Runner.Compile` (`runtime/DotNetCoder.Runner/Runner.cs`), where
`language == "fsharp"` currently returns a diagnostic. An implementation needs to:

1. Add `FSharp.Compiler.Service` behind an MSBuild flag so the default bundle
   stays small (`<PackageReference … Condition="'$(IncludeFSharp)' == 'true'" />`
   plus a matching `DefineConstants`).
2. Retain the raw bytes passed to `AddReference`. FCS wants reference
   assemblies as *file paths*, not `MetadataReference` objects, so they have to
   be written into Mono's in-memory filesystem (`/tmp`) before compiling. This
   is the main cost: it roughly doubles the reference memory.
3. Write the sources to that same in-memory filesystem and invoke
   `FSharpChecker.Compile` with `--target:exe -o /tmp/out.dll` and one `-r:` per
   reference, then read the emitted assembly back as bytes and hand it to the
   existing `Run` path.
4. Map `FSharpDiagnostic` onto the same JSON shape `ToDiagnosticRecord` produces.

Note that F# compilation is **order-dependent** and requires the file holding
`[<EntryPoint>]` to come last. `getSourceFiles` in `src/utils/virtualFS.ts`
already orders F# files that way.

## Project layout

```
src/
  App.tsx                     Root component: layout, language and filesystem state
  constants.ts                Runtime path, SharedArrayBuffer layout, size limits
  types/index.ts              Shared types, including the worker protocol
  hooks/useRunner.ts          Worker lifecycle, console buffer, stdin plumbing
  workers/
    runner.worker.ts          Boots the .NET runtime, compiles and runs
    dotnetRuntime.ts          Typings for dotnet.js + export resolution
  utils/
    virtualFS.ts              IndexedDB filesystems, entries, import/export
    stdinChannel.ts           The SharedArrayBuffer stdin protocol (both sides)
    languages.ts              Language registry (C#, VB.NET, F#)
    localFolderIo.ts          File System Access API helpers
    monacoSetup.ts            Self-hosted Monaco, tokenizer-only languages
    storage.ts, args.ts, ...
  components/
    CodeEditor.tsx            Monaco + diagnostic markers
    ConsolePanel.tsx          Console / Problems tabs, blocking input line
    FileSystemPanel.tsx       Filesystem browser, folder connect, zip import
    dialogs/DialogProvider.tsx  Promise-based confirm/prompt/alert

runtime/
  DotNetCoder.Runner/         The WASM host
    Runner.cs                 Compile + run + diagnostics (the core, no interop)
    Exports.cs                The [JSExport] surface — browser-only
    ConsoleBridge.cs          Console.Out/In redirected to JavaScript
    Host.cs                   [JSImport] declarations
    DotNetCoder.Runner.csproj Build settings — read the comments before editing
  DotNetCoder.Runner.Tests/   Runs Runner.cs on desktop .NET (no browser needed)
  build-runtime.sh / .ps1     Publish + copy + generate references.json
```

## Testing

```
npm test              # Vitest: virtual filesystem, stdin protocol, languages
npm run test:runtime  # The C#/VB compiler core, on desktop .NET
npm run test:e2e      # Playwright: the built app in Chromium
```

`npm run test:runtime` is the useful one when changing the runner: it compiles
the *same* `Runner.cs` the browser uses, feeds Roslyn the running framework's
assemblies exactly as the browser does, and checks compilation, execution,
stdin, exit codes, diagnostics and unhandled exceptions — in about two seconds,
with no browser involved.

## Deploying

Any static host works. For Cloudflare Pages:

* build command: `npm run build:runtime && npm run build`
* output directory: `dist`
* the .NET SDK and `wasm-tools` must be available in the build image, or commit
  `public/dotnet/` (remove it from `.gitignore`) and use `npm run build` alone.

## Where the runtime runs

The worker thread is strongly preferred: it is the only place
`Console.ReadLine()` can block, and therefore the only place a student can type
input while a program waits. The UI thread works too, but there stdin can only
come from the Inputs tab, and a runaway loop freezes the tab instead of being
stoppable.

`?runtime=` picks a host:

| | |
|---|---|
| *(default)* | Use the worker. Fall back to the UI thread — with a message in the console — if this browser has no workers, if the worker cannot be constructed, if it fails, or if it has not started within 45 seconds. |
| `?runtime=worker` | Pin the worker, no fallback. |
| `?runtime=main` | Pin the UI thread, no fallback. |

`?trace=1` turns on the runtime's own verbose logging. Note that a worker's
`location` is its own script URL, so the flag is passed to it explicitly in the
`init` message — reading it from `location` inside the worker silently does
nothing, which is a mistake worth not repeating.

### Why the worker needs two fake globals

`dotnet.js` and `dotnet.runtime.js` classify their host like this:

```js
IS_WORKER  = typeof importScripts === 'function'
IS_SIDECAR = IS_WORKER && typeof dotnetSidecar !== 'undefined'
IS_PTHREAD = IS_WORKER && !IS_SIDECAR
```

A *module* worker has neither `window` nor `importScripts`, so it is classified
as a command-line shell. Defining only `importScripts` is worse: the runtime
then thinks it is a pthread, and the loader deliberately never resolves its
asset promises (`IS_PTHREAD || coreAssetsInMemory.promise_control.resolve()`)
because in a real pthread the main thread owns them — while
`onRuntimeInitialized` sits on `await coreAssetsInMemory.promise`. Every
assembly downloads, each one is logged, and then nothing happens, with no error.

`workerEnvironment.ts` defines both globals, landing on worker + sidecar —
.NET's own term for a runtime hosted in a dedicated worker.
`workerEnvironment.test.ts` asserts against those classification rules directly.

## Limitations

* No debugger yet — breakpoints and stepping are the obvious next step.
* No `HttpClient`, sockets, or real file I/O from student code; there is no
  server and the WASM sandbox has no filesystem outside its own memory.
* `Environment.Exit()` in student code terminates the runtime; press **Restart**.
* Each run loads a new assembly into the default load context (Mono's WASM
  runtime has no collectible contexts), so a very long session slowly grows in
  memory. Reloading the page clears it.
* Chrome or Edge is recommended: **Connect a folder** needs the File System
  Access API, which Firefox and Safari do not implement.
* No NuGet, and no way to add external libraries: student code has the .NET
  class library and nothing beyond it. This is a language sketchpad, not a
  development environment.

## Credits and licensing

This project is MIT-licensed (see [`LICENSE`](LICENSE)). It redistributes a
good deal of other people's work — the .NET runtime and class libraries and the
Roslyn compilers (MIT, © .NET Foundation and Contributors), the Monaco Editor
(MIT, © Microsoft Corporation) together with the Codicons icon font
(**CC BY 4.0**, © Microsoft Corporation), React (MIT, © Meta Platforms, Inc.)
and JSZip (used under the MIT half of its dual licence). Thanks to all of them.

The full notices, with licence texts, are in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Those obligations attach to the *distribution*, and for a web app the
distribution is the page a student loads — so the notices are also served with
the site, at `/third-party-notices.txt` and `/monaco-third-party-notices.txt`,
and linked from the **About** dialog in the header.
`scripts/copy-notices.mjs` writes those copies as a `prebuild` step, and
`src/utils/notices.test.ts` fails if they drift out of step with the originals.

### Trademarks

The MIT licence grants rights in copyright only, never in trademarks. .NET,
Visual Basic, Visual Studio and Microsoft are trademarks of the Microsoft group
of companies, and this project is not affiliated with, endorsed by, or sponsored
by Microsoft or the .NET Foundation. The interface therefore calls itself
"A .NET Coder" — a description of what it is, rather than a name that leads with
someone else's mark — and the About dialog says so explicitly.
