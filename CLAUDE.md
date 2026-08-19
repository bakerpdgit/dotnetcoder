# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

A browser-based .NET IDE: C#/VB.NET compiled and executed entirely client-side
by Roslyn running inside the .NET WebAssembly runtime. See README.md for the
architecture; this file covers the things that are easy to get wrong.

## Development

```
npm run dev              # Vite dev server on :3000 with HMR
npm run build            # tsc -b && vite build → dist/
npm start                # serve dist/ via server.mjs
npm run build:runtime    # rebuild public/dotnet/ (needs a .NET SDK + wasm-tools)
```

`public/dotnet/` is **not** in git and is **not** produced by `npm run build`.
Without it the app loads and edits fine but Run reports that the bundle is
missing. That failure path is covered by an e2e test — keep it working.

## Testing

```
npm test              # Vitest (jsdom)
npm run test:runtime  # the C#/VB compiler core on desktop .NET — fast, no browser
npm run test:e2e      # Playwright against the built app
```

**When changing anything in `runtime/`, run `npm run test:runtime` first.** It
compiles the same `Runner.cs` the browser uses, with a stub for the JavaScript
bridge, and feeds Roslyn the running framework's own assemblies — the same
reference model the browser uses. It catches nearly everything a browser test
would, in two seconds. Two real bugs were found this way during the initial
build (implicit usings missing for top-level statements; end-of-input latching
across runs), so it earns its keep.

When driving the app with Playwright, capture the browser console
(`page.on('console')` for errors and `page.on('pageerror')`) rather than
relying on screenshots.

## Things that will bite you

### Cross-origin isolation is load-bearing

`Console.ReadLine()` blocks the worker thread via `Atomics.wait`, which needs
`SharedArrayBuffer`, which needs COOP/COEP on every response. The headers are
duplicated in `vite.config.ts`, `server.mjs` and `public/_headers` — change one,
change all three. `test/e2e/smoke.spec.ts` asserts `crossOriginIsolated`.

### The runtime runs on the UI thread by default — for now

`resolveRuntimeMode` in `src/utils/mainThreadRuntime.ts` returns `main` unless
`?runtime=worker` is given, because `dotnet.create()` currently never resolves
inside a worker (see README "Known issues"). Both hosts share
`workers/bootRuntime.ts`, so fixing the worker is a matter of *where* the boot
runs, not *what* it does.

Consequence: `Console.ReadLine()` cannot block, so stdin comes from the Inputs
tab — the same pre-supplied-lines model the desktop test harness uses. The
worker path still answers from that queue first and only prompts for typing once
it is exhausted, so both modes behave the same for a program that reads input.

### Once the worker works again

`Atomics.wait` throws on the main thread, so blocking `Console.ReadLine()` is
only possible in the worker. Do not make the UI thread the default "to simplify
things" — stdin stops working entirely.

`Atomics.wait` throws on the main thread, so blocking `Console.ReadLine()` is
only possible in the worker. That is the only reason the worker exists — do not
remove it as "unused" while the default points elsewhere.

### The worker must be classified as a sidecar, not a pthread

`workers/workerEnvironment.ts` defines `importScripts` *and* `dotnetSidecar` on
the worker scope before dotnet.js is imported. Removing either one breaks
startup silently: without both, the runtime decides it is a shell or a pthread,
and in the pthread case the loader never resolves `coreAssetsInMemory`, which
`onRuntimeInitialized` is awaiting. The symptom is a runtime that downloads
every assembly and then does nothing at all — no error, no diagnostics.
`workerEnvironment.test.ts` encodes the runtime's own rules.

### Webcil must stay off

`<WasmEnableWebcil>false</WasmEnableWebcil>` in `DotNetCoder.Runner.csproj`.
Roslyn reads reference assemblies as ordinary PE images; Webcil rewraps them and
`MetadataReference.CreateFromImage` cannot parse the result. If
`scripts/make-references.mjs` reports "no .dll files found", this is why.

### Native libraries are not assemblies

`Runner.AddReference` validates the PE CLI header before accepting anything,
and `scripts/make-references.mjs` does the same check before listing a file.
Both are load-bearing on Windows, where the runtime's native libraries
(`coreclr.dll`, `clrjit.dll`, `mscordaccore.dll`, …) share the `.dll` extension
with managed assemblies — on Linux they are `.so` and simply never appear.
`MetadataReference.CreateFromImage` accepts them without complaint and the
failure only lands later, as CS0009/BC31519 on every compilation.

### Runner.cs must stay free of JS interop

The JS interop source generator ships in the .NET *targeting pack*, so it runs
on every target framework, not just browser-wasm — and the code it emits needs
`AllowUnsafeBlocks`. Put `[JSExport]` only in `Exports.cs` and `[JSImport]` only
in `Host.cs`; both are excluded from the desktop test project. The moment an
interop attribute lands in `Runner.cs`, `npm run test:runtime` fails with
SYSLIB1075 and a wall of CS0227. `src/utils/projectFiles.test.ts` guards this.

### The target framework follows the installed SDK

`runtime/Directory.Build.props` defines `DotNetCoderTargetFramework`; the build
scripts export it from `dotnet --version`. Do not hard-code `net9.0`/`net10.0`
in a csproj — the browser-wasm runtime packs come from the wasm-tools workload
for the SDK band that is actually installed, so a pinned TFM breaks on any other
machine.

### XML comments cannot contain `--`

An easy one to trip over when documenting MSBuild properties: writing
`dotnet run --project ...` inside a `<!-- -->` block makes the csproj
unparseable, and the error points at a column rather than saying "your comment
is illegal". `src/utils/projectFiles.test.ts` parses every `.csproj`/`.props` to
catch it.

### Trimming must stay off

`<PublishTrimmed>false</PublishTrimmed>`. The trimmer cannot see through Roslyn,
so it strips exactly the framework student code needs. This is the reason the
bundle is ~20MB, and it is a deliberate trade.

### The stdin protocol lives in one place

`src/utils/stdinChannel.ts` defines the SharedArrayBuffer layout for both the UI
thread and the worker. Do not open-code `Atomics.store`/`Atomics.load` against
the buffer elsewhere; the round trip is unit tested through that module.

### Monaco is self-hosted, deliberately

`src/utils/monacoSetup.ts` imports `edcore.main` plus *tokenizer-only* language
contributions. It does not use the default CDN loader (school networks block
CDNs, and cross-origin isolation blocks cross-origin scripts) and it does not
import the TypeScript/HTML/CSS language services (each pulls in a multi-megabyte
worker). If you add a language, add its `basic-languages/*/*.contribution`
import, not the `language/*/monaco.contribution` service.

## Conventions

* **No native browser dialogs.** No `window.confirm`, `alert` or `prompt` — they
  ignore the theme and block the worker's message pump. Use `useDialogs()` from
  `components/dialogs/DialogProvider`.
* **Dark-first Tailwind.** Components use `slate-*` classes; the light theme
  remaps them in `src/styles/index.css` under `html[data-theme="light"]`. If you
  introduce a colour that is not already remapped, add an override and check it
  in light mode.
* **The virtual filesystem is the project.** `getSourceFiles` hands Roslyn every
  file of the active language in the active filesystem, so multi-file projects
  work without any project file. F# ordering is special-cased there.
* TypeScript is strict, and `noUnusedLocals`/`noUnusedParameters` are on; the
  build fails on type errors.
