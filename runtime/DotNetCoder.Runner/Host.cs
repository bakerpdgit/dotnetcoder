using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace DotNetCoder;

/// <summary>
/// The JavaScript half of the bridge. Every method here is implemented by
/// <c>src/workers/runner.worker.ts</c> and registered with
/// <c>setModuleImports("dotnetcoder", …)</c> before the exports are used.
/// </summary>
[SupportedOSPlatform("browser")]
internal static partial class Host
{
    internal const string Module = "dotnetcoder";

    [JSImport("writeStdout", Module)]
    internal static partial void WriteStdout(string text);

    [JSImport("writeStderr", Module)]
    internal static partial void WriteStderr(string text);

    /// <summary>
    /// Blocks the worker thread until the user submits a line, and returns it
    /// without its trailing newline. Returns <c>null</c> at end of input, which
    /// is what makes <c>Console.ReadLine()</c> return <c>null</c>.
    /// </summary>
    [JSImport("readLine", Module)]
    internal static partial string? ReadLine();

    [JSImport("reportStatus", Module)]
    internal static partial void ReportStatus(string phase, string detail);
}
