// Placeholder entry point required by <WasmMainJSPath>.
//
// This module must stay INERT. dotnetcoder never uses it: the IDE boots the
// runtime itself from src/workers/runner.worker.ts so that it runs on a worker
// thread, where the Console.ReadLine bridge is allowed to block.
//
// In particular it must not call dotnet.create(). If the runtime ever imports
// this module as part of its own startup, a top-level `await dotnet.create()`
// here would be a second, nested boot waiting on the first — everything
// downloads, nothing errors, and startup simply never completes.
//
// The browser-wasm SDK only requires that a main JS module is declared, not
// that it does anything.
export {}
