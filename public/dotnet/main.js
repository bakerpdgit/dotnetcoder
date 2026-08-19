// Placeholder entry point required by <WasmMainJSPath>.
//
// dotnetcoder does NOT use this file: the IDE boots the runtime itself from
// src/workers/runner.worker.ts so that it runs on a worker thread, where the
// Console.ReadLine bridge is allowed to block. It is kept because the
// browser-wasm SDK requires a main JS module to be declared.
import { dotnet } from './_framework/dotnet.js'

const { getConfig } = await dotnet.create()
console.log('[dotnetcoder] runtime bundle loaded standalone:', getConfig().mainAssemblyName)
