// Entry point for the WASM host assembly.
//
// The IDE never calls dotnet.run(); it boots the runtime, then invokes the
// [JSExport] methods on Runner directly. Main exists only because the
// browser-wasm SDK requires an executable output type.
System.Console.WriteLine("[dotnetcoder] runner host started");
