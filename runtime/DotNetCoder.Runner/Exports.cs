using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace DotNetCoder;

/// <summary>
/// The JavaScript-callable surface of the runner, and the only file in the
/// project that uses [JSExport].
///
/// It is kept separate from <see cref="Runner"/> on purpose. The JS interop
/// source generator ships in the .NET targeting pack, so it runs on *any*
/// target framework, not just browser-wasm — and the code it emits requires
/// <c>AllowUnsafeBlocks</c>. Excluding this one file is what lets
/// DotNetCoder.Runner.Tests compile the real Runner.cs on desktop .NET without
/// dragging in browser interop stubs that could never be invoked there.
///
/// The names here are what the IDE reaches for from JavaScript, as
/// <c>exports.DotNetCoder.Exports.*</c> — see src/workers/dotnetRuntime.ts.
/// </summary>
[SupportedOSPlatform("browser")]
public static partial class Exports
{
    /// <summary>Redirects Console to the JavaScript bridge. Call once.</summary>
    [JSExport]
    internal static void Initialize() => Runner.Initialize();

    /// <summary>Registers one framework assembly as a compilation reference.</summary>
    [JSExport]
    internal static int AddReference(string name, byte[] data) => Runner.AddReference(name, data);

    [JSExport]
    internal static int ReferenceCount() => Runner.ReferenceCount();

    /// <summary>Compiles the given sources; returns the diagnostics as JSON.</summary>
    [JSExport]
    internal static string Compile(string language, string sourcesJson) => Runner.Compile(language, sourcesJson);

    /// <summary>Runs the last successful compilation; returns the result as JSON.</summary>
    [JSExport]
    internal static string Run(string argsJson) => Runner.Run(argsJson);
}
