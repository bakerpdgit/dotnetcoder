// Stand-in for the JavaScript bridge (runtime/DotNetCoder.Runner/Host.cs).
// On desktop .NET the [JSImport] partial methods cannot exist, so the test
// project compiles this instead: it captures output and replays canned stdin.

namespace DotNetCoder;

internal static class Host
{
    internal static readonly System.Text.StringBuilder Out = new();
    internal static readonly System.Text.StringBuilder Err = new();
    internal static readonly Queue<string> Stdin = new();
    internal static readonly List<string> Status = new();

    internal static void WriteStdout(string text) => Out.Append(text);
    internal static void WriteStderr(string text) => Err.Append(text);
    internal static string? ReadLine() => Stdin.Count > 0 ? Stdin.Dequeue() : null;
    internal static void ReportStatus(string phase, string detail) => Status.Add($"{phase}:{detail}");

    internal static void Reset()
    {
        Out.Clear();
        Err.Clear();
        Stdin.Clear();
        Status.Clear();
    }
}
