using System.Text.Json;

namespace DotNetCoder.Tests;

/// <summary>
/// A tiny hand-rolled test runner — no test framework, so the project restores
/// only Roslyn and `dotnet run` gives immediate, readable output.
/// Exit code 0 = all passed.
/// </summary>
internal static class Harness
{
    private static int _failures;
    private static int _passes;
    private static readonly TextWriter Report = Console.Out;

    private static int Main()
    {
        // Deliberately hand over *everything* beside the managed assemblies,
        // including the runtime's native libraries — on Windows those are also
        // .dll (coreclr.dll, clrjit.dll, mscordaccore.dll, …) while on Linux
        // they are .so and would never be picked up. Runner.AddReference is
        // responsible for telling them apart; feeding it the raw directory is
        // what makes this test meaningful on both platforms.
        var runtimeDir = Path.GetDirectoryName(typeof(object).Assembly.Location)!;
        var referenceCount = 0;
        foreach (var dll in Directory.GetFiles(runtimeDir, "*.dll").OrderBy(x => x))
        {
            var name = Path.GetFileName(dll);
            if (name.StartsWith("Microsoft.CodeAnalysis", StringComparison.Ordinal)) continue;
            referenceCount = Runner.AddReference(name, File.ReadAllBytes(dll));
        }
        var skipped = Runner.SkippedReferenceNames;
        Report.WriteLine($"references loaded: {referenceCount} (from {runtimeDir})");
        Report.WriteLine(skipped.Count == 0
            ? "no files were skipped"
            : $"skipped {skipped.Count} non-managed file(s): {string.Join(", ", skipped.Take(6))}{(skipped.Count > 6 ? ", …" : "")}");
        if (referenceCount == 0)
        {
            Report.WriteLine("FAIL  no reference assemblies were loaded");
            return 1;
        }

        Runner.Initialize();

        NativeLibrariesAreSkipped();
        ConsoleNewlineIsAlwaysLf();

        // ── C# ──────────────────────────────────────────────────────────────
        Case("C# hello world", "csharp",
            [("/Program.cs", "using System;\nclass Program { static void Main() { Console.WriteLine(\"Hello, World!\"); } }\n")],
            expectOut: "Hello, World!\n", expectExit: 0);

        Case("C# top-level statements (implicit usings)", "csharp",
            [("/Program.cs", "Console.WriteLine(1 + 2);\n")],
            expectOut: "3\n", expectExit: 0);

        Case("C# multi-file, generics and LINQ", "csharp",
            [
                ("/Program.cs", "using System;\nusing System.Linq;\nclass Program { static void Main() { Console.WriteLine(new Shape(3,4).Area()); Console.WriteLine(string.Join(\",\", Enumerable.Range(1,4).Select(x => x*x))); } }\n"),
                ("/Shape.cs", "public class Shape { private readonly int _w, _h; public Shape(int w, int h) { _w = w; _h = h; } public int Area() => _w * _h; }\n"),
            ],
            expectOut: "12\n1,4,9,16\n", expectExit: 0);

        Case("C# modern language features compile", "csharp",
            [("/Program.cs", "var p = new Point(2, 3);\nConsole.WriteLine($\"{p.X + p.Y}\");\nrecord Point(int X, int Y);\n")],
            expectOut: "5\n", expectExit: 0);

        Case("C# Console.ReadLine and prompt flushing", "csharp",
            [("/Program.cs", "using System;\nclass Program { static void Main() { Console.Write(\"Name? \"); var n = Console.ReadLine(); Console.WriteLine($\"Hi {n}\"); Console.WriteLine(int.Parse(Console.ReadLine()!) * 2); } }\n")],
            stdin: ["Ada", "21"], expectOut: "Name? Hi Ada\n42\n", expectExit: 0);

        Case("C# ReadLine returns null at end of input", "csharp",
            [("/Program.cs", "using System;\nclass Program { static void Main() { Console.WriteLine(Console.ReadLine() is null ? \"<null>\" : \"?\"); } }\n")],
            expectOut: "<null>\n", expectExit: 0);

        // Regression: end-of-input used to latch permanently, so the *next* run
        // saw a closed stdin and every ReadLine returned null immediately.
        Case("stdin reopens after a run that hit end of input", "csharp",
            [("/Program.cs", "using System;\nclass Program { static void Main() { Console.WriteLine(Console.ReadLine() ?? \"<null>\"); } }\n")],
            stdin: ["second run"], expectOut: "second run\n", expectExit: 0);

        Case("C# Console.Read and ReadLine interleave", "csharp",
            [("/Program.cs", "using System;\nclass Program { static void Main() { var c = (char)Console.Read(); var rest = Console.ReadLine(); Console.WriteLine($\"[{c}][{rest}]\"); } }\n")],
            stdin: ["abc"], expectOut: "[a][bc]\n", expectExit: 0);

        Case("C# exit code is taken from Main", "csharp",
            [("/Program.cs", "class Program { static int Main() { return 7; } }\n")],
            expectOut: "", expectExit: 7);

        Case("C# async Main is awaited", "csharp",
            [("/Program.cs", "using System;\nusing System.Threading.Tasks;\nclass Program { static async Task Main() { await Task.Yield(); Console.WriteLine(\"async ok\"); } }\n")],
            expectOut: "async ok\n", expectExit: 0);

        Case("C# command-line arguments reach Main", "csharp",
            [("/Program.cs", "using System;\nclass Program { static void Main(string[] args) { Console.WriteLine(string.Join(\"|\", args)); } }\n")],
            args: ["a", "b c"], expectOut: "a|b c\n", expectExit: 0);

        Case("C# stderr is separated from stdout", "csharp",
            [("/Program.cs", "using System;\nclass Program { static void Main() { Console.WriteLine(\"out\"); Console.Error.WriteLine(\"err\"); } }\n")],
            expectOut: "out\n", expectErr: "err\n", expectExit: 0);

        CaseException("C# unhandled exception is reported without runner frames", "csharp",
            [("/Program.cs", "using System;\nclass Program { static void Main() { Console.WriteLine(\"before\"); throw new InvalidOperationException(\"boom\"); } }\n")],
            expectOut: "before\n");

        // ── VB.NET ──────────────────────────────────────────────────────────
        Case("VB hello world", "vb",
            [("/Program.vb", "Module Program\n    Sub Main()\n        Console.WriteLine(\"Hello, World!\")\n    End Sub\nEnd Module\n")],
            expectOut: "Hello, World!\n", expectExit: 0);

        Case("VB global imports, Option Infer and the VB runtime", "vb",
            [("/Program.vb", "Module Program\n    Sub Main()\n        Dim xs = New List(Of Integer) From {1, 2, 3}\n        Console.WriteLine(xs.Sum())\n        Console.WriteLine(UCase(\"vb\"))\n    End Sub\nEnd Module\n")],
            expectOut: "6\nVB\n", expectExit: 0);

        Case("VB Console.ReadLine", "vb",
            [("/Program.vb", "Module Program\n    Sub Main()\n        Console.Write(\"Age? \")\n        Console.WriteLine(CInt(Console.ReadLine()) + 1)\n    End Sub\nEnd Module\n")],
            stdin: ["16"], expectOut: "Age? 17\n", expectExit: 0);

        Case("VB multi-file with a class", "vb",
            [
                ("/Program.vb", "Module Program\n    Sub Main()\n        Console.WriteLine(New Dog(\"Rex\").Speak())\n    End Sub\nEnd Module\n"),
                ("/Dog.vb", "Public Class Dog\n    Private ReadOnly _name As String\n    Public Sub New(name As String)\n        _name = name\n    End Sub\n    Public Function Speak() As String\n        Return _name & \" says woof\"\n    End Function\nEnd Class\n"),
            ],
            expectOut: "Rex says woof\n", expectExit: 0);

        // ── Diagnostics ─────────────────────────────────────────────────────
        CaseCompileError("C# type error reports a 1-based position", "csharp",
            [("/Program.cs", "class Program { static void Main() { int x = \"oops\"; } }\n")], expectId: "CS0029");

        CaseCompileError("C# missing Main is a clear error", "csharp",
            [("/Lib.cs", "public class Lib { public int X => 1; }\n")], expectId: "CS5001");

        CaseCompileError("VB undeclared name reports a position", "vb",
            [("/Program.vb", "Module Program\n    Sub Main()\n        Dim x As Integer = NotAThing()\n    End Sub\nEnd Module\n")], expectId: "BC30451");

        CaseCompileError("an empty filesystem is a clear error", "csharp", [], expectId: "DNC0001");

        CaseCompileError("F# reports that it is not in this bundle", "fsharp",
            [("/Program.fs", "[<EntryPoint>]\nlet main _ = 0\n")], expectId: "DNC0001");

        Report.WriteLine();
        Report.WriteLine(_failures == 0
            ? $"ALL {_passes} TESTS PASSED"
            : $"{_failures} FAILURE(S), {_passes} passed");
        return _failures == 0 ? 0 : 1;
    }

    /// <summary>
    /// Regression test for Console.WriteLine emitting "\r\n" on Windows.
    ///
    /// The browser runtime is Unix-like, so the desktop harness only simulates
    /// it faithfully if the console bridge fixes its own line terminator. On
    /// Linux the platform default is already "\n", so asserting the output is
    /// "\n" proves nothing on its own — hence the sentinel below, which is what
    /// makes this test meaningful on any platform.
    /// </summary>
    private static void ConsoleNewlineIsAlwaysLf()
    {
        const string label = "console newlines are LF on every platform";

        Host.Reset();
        var writer = new JsTextWriter(isError: false);
        var declared = writer.NewLine;

        writer.WriteLine("x");
        writer.Flush();
        var fromString = Host.Out.ToString();

        Host.Reset();
        writer.WriteLine(1);
        writer.Flush();
        var fromInt = Host.Out.ToString();
        Host.Reset();

        if (declared != "\n") { Fail(label, $"the writer declares NewLine as {Q(declared)}"); return; }
        if (fromString != "x\n") { Fail(label, $"WriteLine(string) emitted {Q(fromString)}"); return; }
        if (fromInt != "1\n") { Fail(label, $"WriteLine(int) emitted {Q(fromInt)}"); return; }

        // The decisive check. TextWriter keeps the newline in two places: the
        // protected CoreNewLine char[] and a private string. WriteLine(int)
        // reads the array; WriteLine(string) reads the string. Assigning the
        // field alone updates one of them, and on a host whose platform default
        // is already "\n" the resulting output looks perfectly correct — the
        // bug only appears on Windows.
        //
        // So drive the *same constructor* with a sentinel no platform uses. If
        // both overloads end with it, the assignment reaches every backing
        // store, and the public constructor passing "\n" is therefore correct
        // everywhere.
        Host.Reset();
        var sentinel = new JsTextWriter(isError: false, newLine: "#");
        sentinel.WriteLine(1);
        sentinel.Flush();
        var sentinelInt = Host.Out.ToString();
        Host.Reset();
        sentinel.WriteLine("x");
        sentinel.Flush();
        var sentinelString = Host.Out.ToString();
        Host.Reset();

        if (sentinelInt != "1#")
        {
            Fail(label, $"WriteLine(int) ignored the configured terminator, giving {Q(sentinelInt)}");
            return;
        }
        if (sentinelString != "x#")
        {
            Fail(label, $"WriteLine(string) ignored the configured terminator, giving {Q(sentinelString)} — " +
                        "the terminator must be assigned through the NewLine property, not the CoreNewLine field");
            return;
        }

        Pass(label, $"string={Q(fromString)} int={Q(fromInt)}; sentinel proves both overloads honour the configured terminator");
    }

    /// <summary>
    /// Regression test for the failure that native runtime libraries caused on
    /// Windows: MetadataReference.CreateFromImage accepts them silently and
    /// every later compilation dies with CS0009 / BC31519.
    ///
    /// Rather than depending on a native .dll existing on this platform, it
    /// manufactures one — a real, structurally valid PE whose CLI header
    /// directory has been zeroed, which is exactly what a native library looks
    /// like to Roslyn.
    /// </summary>
    private static void NativeLibrariesAreSkipped()
    {
        const string name = "PretendNative.dll";
        var managed = File.ReadAllBytes(typeof(object).Assembly.Location);
        var native = StripCliHeader(managed);
        if (native is null) { Fail("native libraries are skipped", "could not build the PE fixture"); return; }

        var before = Runner.ReferenceCount();
        Runner.AddReference(name, native);
        if (Runner.ReferenceCount() != before)
        {
            Fail("native libraries are skipped", "a PE without managed metadata was accepted as a reference");
            return;
        }
        if (!Runner.SkippedReferenceNames.Contains(name))
        {
            Fail("native libraries are skipped", "the skip was not reported");
            return;
        }

        // Garbage that is not a PE at all must not be fatal either.
        Runner.AddReference("NotEvenAPeFile.dll", new byte[] { 1, 2, 3, 4 });
        if (Runner.ReferenceCount() != before)
        {
            Fail("native libraries are skipped", "a non-PE blob was accepted as a reference");
            return;
        }

        Pass("native libraries are skipped", $"{Runner.SkippedReferenceNames.Count} skipped, {before} references intact");
    }

    /// <summary>
    /// Zeroes data directory 14 (the CLI header) of a PE image, turning a
    /// managed assembly into something indistinguishable from a native DLL.
    /// Returns null if the layout is not what we expect.
    /// </summary>
    private static byte[]? StripCliHeader(byte[] image)
    {
        if (image.Length < 0x40) return null;
        var copy = (byte[])image.Clone();

        var peOffset = BitConverter.ToInt32(copy, 0x3C);
        if (peOffset <= 0 || peOffset + 24 > copy.Length) return null;
        if (copy[peOffset] != 'P' || copy[peOffset + 1] != 'E') return null;

        var optionalHeader = peOffset + 24;
        if (optionalHeader + 2 > copy.Length) return null;
        var magic = BitConverter.ToUInt16(copy, optionalHeader);

        // PE32 keeps the data directories at +96, PE32+ at +112.
        var dataDirectories = optionalHeader + magic switch { 0x10B => 96, 0x20B => 112, _ => -1 };
        if (dataDirectories < optionalHeader) return null;

        var cliDirectory = dataDirectories + (14 * 8);
        if (cliDirectory + 8 > copy.Length) return null;
        Array.Clear(copy, cliDirectory, 8);
        return copy;
    }

    // ── Case helpers ────────────────────────────────────────────────────────

    private static (bool Success, JsonElement Diagnostics, JsonDocument Doc) Compile(
        string language, (string Path, string Text)[] sources, string[] stdin)
    {
        Host.Reset();
        foreach (var line in stdin) Host.Stdin.Enqueue(line);
        var json = Runner.Compile(language, JsonSerializer.Serialize(
            sources.Select(s => new { path = s.Path, text = s.Text })));
        var doc = JsonDocument.Parse(json);
        return (doc.RootElement.GetProperty("success").GetBoolean(),
                doc.RootElement.GetProperty("diagnostics"), doc);
    }

    private static (int ExitCode, string? Error) Run(string[] args)
    {
        using var doc = JsonDocument.Parse(Runner.Run(JsonSerializer.Serialize(args)));
        var error = doc.RootElement.GetProperty("error");
        return (doc.RootElement.GetProperty("exitCode").GetInt32(),
                error.ValueKind == JsonValueKind.Null ? null : error.GetString());
    }

    private static void Case(
        string name, string language, (string Path, string Text)[] sources,
        string? expectOut = null, string? expectErr = null, int? expectExit = null,
        string[]? stdin = null, string[]? args = null)
    {
        var (success, diagnostics, doc) = Compile(language, sources, stdin ?? []);
        using (doc)
        {
            if (!success) { Fail(name, $"compilation failed: {diagnostics}"); return; }
        }

        var (exitCode, error) = Run(args ?? []);
        var actualOut = Host.Out.ToString();
        var actualErr = Host.Err.ToString();

        if (expectOut is not null && actualOut != expectOut)
        {
            Fail(name, $"stdout was {Q(actualOut)}, expected {Q(expectOut)}{(error is null ? "" : $" (error: {Trunc(error)})")}");
            return;
        }
        if (expectErr is not null && actualErr != expectErr)
        {
            Fail(name, $"stderr was {Q(actualErr)}, expected {Q(expectErr)}");
            return;
        }
        if (expectExit is not null && exitCode != expectExit)
        {
            Fail(name, $"exit code was {exitCode}, expected {expectExit}{(error is null ? "" : $" (error: {Trunc(error)})")}");
            return;
        }
        Pass(name, $"stdout={Q(actualOut)} exit={exitCode}");
    }

    private static void CaseException(
        string name, string language, (string Path, string Text)[] sources, string expectOut)
    {
        var (success, diagnostics, doc) = Compile(language, sources, []);
        using (doc)
        {
            if (!success) { Fail(name, $"compilation failed: {diagnostics}"); return; }
        }

        var (exitCode, error) = Run([]);
        if (error is null) { Fail(name, "expected an unhandled exception, got none"); return; }
        if (Host.Out.ToString() != expectOut) { Fail(name, $"stdout before the throw was {Q(Host.Out.ToString())}"); return; }
        if (exitCode == 0) { Fail(name, "expected a non-zero exit code"); return; }
        if (error.Contains("System.Reflection.", StringComparison.Ordinal)
            || error.Contains("RuntimeMethodHandle", StringComparison.Ordinal)
            || error.Contains("DotNetCoder.Runner", StringComparison.Ordinal))
        {
            Fail(name, $"runner plumbing leaked into the stack trace: {Trunc(error)}");
            return;
        }
        if (!error.Contains("Program.Main", StringComparison.Ordinal))
        {
            Fail(name, $"the student's own frame is missing: {Trunc(error)}");
            return;
        }
        Pass(name, Trunc(error)!);
    }

    private static void CaseCompileError(
        string name, string language, (string Path, string Text)[] sources, string expectId)
    {
        var (success, diagnostics, doc) = Compile(language, sources, []);
        using (doc)
        {
            if (success) { Fail(name, "expected the compilation to fail"); return; }
            var errors = diagnostics.EnumerateArray()
                .Where(d => d.GetProperty("severity").GetString() == "error")
                .ToList();
            if (errors.Count == 0) { Fail(name, "no error diagnostics were produced"); return; }
            var match = errors.FirstOrDefault(d => d.GetProperty("id").GetString() == expectId);
            if (match.ValueKind == JsonValueKind.Undefined)
            {
                Fail(name, $"expected {expectId}, got {string.Join(", ", errors.Select(e => e.GetProperty("id").GetString()))}");
                return;
            }
            if (match.GetProperty("line").GetInt32() < 1 || match.GetProperty("column").GetInt32() < 1)
            {
                Fail(name, "diagnostic positions must be 1-based");
                return;
            }
            Pass(name, $"{expectId} at line {match.GetProperty("line").GetInt32()}: {Trunc(match.GetProperty("message").GetString())}");
        }
    }

    private static string Q(string s) => "\"" + s.Replace("\n", "\\n").Replace("\r", "\\r") + "\"";

    private static string? Trunc(string? s) =>
        s is null ? null : (s.Length > 110 ? s[..110] + "…" : s).Replace("\r", "").Replace("\n", " ");

    private static void Pass(string name, string detail)
    {
        _passes++;
        Report.WriteLine($"  PASS  {name}  —  {detail}");
    }

    private static void Fail(string name, string detail)
    {
        _failures++;
        Report.WriteLine($"  FAIL  {name}  —  {detail}");
    }
}
