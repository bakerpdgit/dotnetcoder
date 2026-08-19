using System.Collections.Immutable;
using System.Reflection;
using System.Reflection.PortableExecutable;
using System.Runtime.Loader;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Text;
using Microsoft.CodeAnalysis.VisualBasic;

namespace DotNetCoder;

/// <summary>
/// The compiler/executor the IDE drives from JavaScript.
///
/// Deliberately free of JavaScript interop: the [JSExport] surface lives in
/// Exports.cs, which only the browser build compiles. That keeps this file
/// buildable on desktop .NET, where DotNetCoder.Runner.Tests exercises it, and
/// stops the JS interop source generator from running where it makes no sense
/// (it emits unsafe code and would need AllowUnsafeBlocks in the test project
/// to compile stubs that could never be called).
///
/// Lifecycle, all on the worker thread:
///   Initialize()  → redirect Console to the JS bridge
///   AddReference() × N → feed the framework assemblies Roslyn compiles against
///   Compile()     → parse + emit to an in-memory assembly, return diagnostics
///   Run()         → load that assembly and invoke its entry point
/// </summary>
public static class Runner
{
    private static readonly List<MetadataReference> References = new();
    private static readonly HashSet<string> ReferenceNames = new(StringComparer.OrdinalIgnoreCase);
    private static readonly List<string> SkippedReferences = new();

    private static byte[]? _compiledAssembly;
    private static int _compileCounter;
    private static JsTextWriter? _stdout;
    private static JsTextWriter? _stderr;
    private static JsTextReader? _stdin;

    /// <summary>Redirects Console to the JavaScript bridge. Call once.</summary>
    internal static void Initialize()
    {
        if (_stdout is not null) return;
        _stdout = new JsTextWriter(isError: false);
        _stderr = new JsTextWriter(isError: true);
        _stdin = new JsTextReader(_stdout);
        Console.SetOut(_stdout);
        Console.SetError(_stderr);
        Console.SetIn(_stdin);
        Host.ReportStatus("ready", string.Empty);
    }

    /// <summary>
    /// Registers one framework assembly as a compilation reference. The bytes
    /// come from JavaScript, which fetches them out of <c>_framework/</c> — the
    /// browser serves them from cache, since the runtime already downloaded the
    /// same URLs at boot.
    /// </summary>
    internal static int AddReference(string name, byte[] data)
    {
        if (!ReferenceNames.Add(name)) return References.Count;
        try
        {
            // MetadataReference.CreateFromImage does not parse anything up
            // front, so a native library slipped in here would not fail now —
            // it would resurface as CS0009 ("PE image doesn't contain managed
            // metadata") on every single compilation, with no clue which caller
            // was at fault. Check eagerly and skip instead.
            //
            // This matters because the caller passes whatever sits beside the
            // managed assemblies: on Windows the runtime's native libraries
            // (coreclr.dll, clrjit.dll, mscordaccore.dll, …) share the .dll
            // extension, while on Linux they are .so and never show up.
            using (var peStream = new MemoryStream(data, writable: false))
            using (var peReader = new PEReader(peStream))
            {
                if (!peReader.HasMetadata)
                {
                    ReferenceNames.Remove(name);
                    SkippedReferences.Add(name);
                    Host.ReportStatus("reference-skipped", $"{name}: native library, not a managed assembly");
                    return References.Count;
                }
            }

            References.Add(MetadataReference.CreateFromImage(data, filePath: name));
        }
        catch (Exception ex)
        {
            // A malformed file should not be fatal either.
            ReferenceNames.Remove(name);
            SkippedReferences.Add(name);
            Host.ReportStatus("reference-skipped", $"{name}: {ex.Message}");
        }
        return References.Count;
    }

    /// <summary>Names rejected by <see cref="AddReference"/>, for diagnostics.</summary>
    internal static IReadOnlyCollection<string> SkippedReferenceNames => SkippedReferences;

    internal static int ReferenceCount() => References.Count;

    /// <summary>
    /// Compiles <paramref name="sourcesJson"/> (<c>[{"path":…,"text":…}]</c>).
    /// Returns <c>{"success":bool,"diagnostics":[…]}</c>.
    /// </summary>
    internal static string Compile(string language, string sourcesJson)
    {
        List<(string Path, string Text)> sources;
        try
        {
            sources = ParseSources(sourcesJson);
        }
        catch (Exception ex)
        {
            return WriteResult(false, new[] { FatalDiagnostic($"Could not read the source list: {ex.Message}") });
        }

        if (sources.Count == 0)
        {
            return WriteResult(false, new[] { FatalDiagnostic("There are no source files to compile in this filesystem.") });
        }

        if (References.Count == 0)
        {
            return WriteResult(false, new[] { FatalDiagnostic("The compiler has no reference assemblies loaded. Reload the page to re-initialise the runtime.") });
        }

        // F# does not go through Roslyn: it needs FSharp.Compiler.Service, which
        // is a separate ~30MB dependency with its own compilation model. The
        // seam is here; see README "Adding F#" for what the implementation
        // needs to do.
        if (language == "fsharp")
        {
            return WriteResult(false, new[]
            {
                FatalDiagnostic(
                    "F# is not included in this runtime bundle. C# and VB.NET share the Roslyn " +
                    "compiler; F# needs FSharp.Compiler.Service, which has not been added yet. " +
                    "You can still write and save F# files — see README \"Adding F#\"."),
            });
        }

        var assemblyName = $"UserProgram_{++_compileCounter}";

        Compilation compilation;
        try
        {
            compilation = language == "vb"
                ? CreateVisualBasicCompilation(assemblyName, sources)
                : CreateCSharpCompilation(assemblyName, sources);
        }
        catch (Exception ex)
        {
            return WriteResult(false, new[] { FatalDiagnostic($"Could not start the compiler: {ex.Message}") });
        }

        using var peStream = new MemoryStream();
        var emitResult = compilation.Emit(peStream);
        var diagnostics = emitResult.Diagnostics
            .Where(d => d.Severity != DiagnosticSeverity.Hidden)
            .Select(ToDiagnosticRecord)
            .ToArray();

        if (emitResult.Success)
        {
            _compiledAssembly = peStream.ToArray();
        }

        return WriteResult(emitResult.Success, diagnostics);
    }

    /// <summary>
    /// Runs the assembly produced by the last successful <see cref="Compile"/>.
    /// Returns <c>{"exitCode":int,"error":string|null}</c>.
    /// </summary>
    internal static string Run(string argsJson)
    {
        if (_compiledAssembly is null)
        {
            return WriteRunResult(1, "Nothing has been compiled yet.");
        }

        var args = ParseArgs(argsJson);
        // Each run starts from a clean console: stdin is reopened and any
        // partial output from a previous run is discarded.
        _stdin?.ResetStream();
        var exitCode = 0;
        string? error = null;

        try
        {
            // Mono's WASM runtime does not support collectible load contexts, so
            // each run loads into the default context under a fresh assembly
            // name. Long sessions therefore accumulate a little memory; a page
            // reload clears it.
            var assembly = AssemblyLoadContext.Default.LoadFromStream(new MemoryStream(_compiledAssembly));
            var entryPoint = assembly.EntryPoint;
            if (entryPoint is null)
            {
                error = "No entry point was found. Add a Main method.";
                exitCode = 1;
            }
            else
            {
                var parameters = entryPoint.GetParameters();
                var invokeArgs = parameters.Length == 0 ? null : new object?[] { args };
                var result = entryPoint.Invoke(null, invokeArgs);
                exitCode = result switch
                {
                    int code => code,
                    Task<int> task => task.GetAwaiter().GetResult(),
                    Task task => RunTask(task),
                    _ => 0,
                };
            }
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            error = Describe(ex.InnerException);
            exitCode = 134;
        }
        catch (Exception ex)
        {
            error = Describe(ex);
            exitCode = 134;
        }
        finally
        {
            _stdout?.Flush();
            _stderr?.Flush();
        }

        return WriteRunResult(exitCode, error);
    }

    private static int RunTask(Task task)
    {
        task.GetAwaiter().GetResult();
        return 0;
    }

    // ── Compilation setup ──────────────────────────────────────────────────

    /// <summary>
    /// The implicit global usings the .NET SDK generates for a console project
    /// (<c>ImplicitUsings=enable</c>). Without these, top-level statements such
    /// as <c>Console.WriteLine("hi");</c> — which is what every modern C#
    /// tutorial opens with — fail to compile, and code written in Visual Studio
    /// would behave differently here.
    /// </summary>
    private const string ImplicitUsingsSource = @"global using global::System;
global using global::System.Collections.Generic;
global using global::System.IO;
global using global::System.Linq;
global using global::System.Net.Http;
global using global::System.Threading;
global using global::System.Threading.Tasks;
";

    internal const string ImplicitUsingsPath = "<implicit usings>";

    private static Compilation CreateCSharpCompilation(string assemblyName, List<(string Path, string Text)> sources)
    {
        var parseOptions = new CSharpParseOptions(Microsoft.CodeAnalysis.CSharp.LanguageVersion.Latest);
        var trees = sources
            .Select(s => CSharpSyntaxTree.ParseText(SourceText.From(s.Text, Encoding.UTF8), parseOptions, path: s.Path))
            .Prepend(CSharpSyntaxTree.ParseText(
                SourceText.From(ImplicitUsingsSource, Encoding.UTF8), parseOptions, path: ImplicitUsingsPath))
            .ToArray();

        var options = new CSharpCompilationOptions(OutputKind.ConsoleApplication)
            .WithOptimizationLevel(OptimizationLevel.Debug)
            .WithAllowUnsafe(true)
            .WithConcurrentBuild(false)
            .WithSpecificDiagnosticOptions(new Dictionary<string, ReportDiagnostic>
            {
                // Version-mismatch chatter caused by referencing the running
                // framework's own assemblies rather than a ref pack. Benign.
                ["CS1701"] = ReportDiagnostic.Suppress,
                ["CS1702"] = ReportDiagnostic.Suppress,
                // "No source files specified" — we always pass sources in memory.
                ["CS8021"] = ReportDiagnostic.Suppress,
            });

        return CSharpCompilation.Create(assemblyName, trees, References, options);
    }

    private static Compilation CreateVisualBasicCompilation(string assemblyName, List<(string Path, string Text)> sources)
    {
        var parseOptions = new VisualBasicParseOptions(Microsoft.CodeAnalysis.VisualBasic.LanguageVersion.Latest);
        var trees = sources
            .Select(s => VisualBasicSyntaxTree.ParseText(SourceText.From(s.Text, Encoding.UTF8), parseOptions, path: s.Path))
            .ToArray();

        // Mirrors the implicit imports and Option settings of a `dotnet new
        // console -lang VB` project, so textbook VB.NET compiles unchanged.
        var options = new VisualBasicCompilationOptions(OutputKind.ConsoleApplication)
            .WithOptimizationLevel(OptimizationLevel.Debug)
            .WithConcurrentBuild(false)
            .WithOptionInfer(true)
            .WithOptionExplicit(true)
            .WithOptionStrict(OptionStrict.Off)
            .WithRootNamespace(string.Empty)
            .WithGlobalImports(GlobalImport.Parse(
                "System",
                "System.Collections.Generic",
                "System.Diagnostics",
                "System.Linq",
                "Microsoft.VisualBasic"));

        return VisualBasicCompilation.Create(assemblyName, trees, References, options);
    }

    // ── JSON helpers ───────────────────────────────────────────────────────

    private sealed record DiagnosticRecord(
        string Id,
        string Severity,
        string Message,
        string? File,
        int Line,
        int Column,
        int EndLine,
        int EndColumn);

    private static List<(string Path, string Text)> ParseSources(string sourcesJson)
    {
        var sources = new List<(string, string)>();
        using var doc = JsonDocument.Parse(sourcesJson);
        foreach (var element in doc.RootElement.EnumerateArray())
        {
            var path = element.TryGetProperty("path", out var p) ? p.GetString() ?? "" : "";
            var text = element.TryGetProperty("text", out var t) ? t.GetString() ?? "" : "";
            sources.Add((path, text));
        }
        return sources;
    }

    private static string[] ParseArgs(string argsJson)
    {
        if (string.IsNullOrWhiteSpace(argsJson)) return Array.Empty<string>();
        try
        {
            using var doc = JsonDocument.Parse(argsJson);
            return doc.RootElement.EnumerateArray()
                .Select(e => e.GetString() ?? string.Empty)
                .ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static DiagnosticRecord ToDiagnosticRecord(Diagnostic diagnostic)
    {
        var span = diagnostic.Location.GetLineSpan();
        var hasLocation = diagnostic.Location.IsInSource;
        return new DiagnosticRecord(
            diagnostic.Id,
            diagnostic.Severity switch
            {
                DiagnosticSeverity.Error => "error",
                DiagnosticSeverity.Warning => "warning",
                _ => "info",
            },
            diagnostic.GetMessage(),
            hasLocation && !string.IsNullOrEmpty(span.Path) ? span.Path : null,
            hasLocation ? span.StartLinePosition.Line + 1 : 1,
            hasLocation ? span.StartLinePosition.Character + 1 : 1,
            hasLocation ? span.EndLinePosition.Line + 1 : 1,
            hasLocation ? span.EndLinePosition.Character + 1 : 1);
    }

    private static DiagnosticRecord FatalDiagnostic(string message) =>
        new("DNC0001", "error", message, null, 1, 1, 1, 1);

    private static string WriteResult(bool success, IReadOnlyList<DiagnosticRecord> diagnostics)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteBoolean("success", success);
            writer.WriteStartArray("diagnostics");
            foreach (var d in diagnostics)
            {
                writer.WriteStartObject();
                writer.WriteString("id", d.Id);
                writer.WriteString("severity", d.Severity);
                writer.WriteString("message", d.Message);
                if (d.File is null) writer.WriteNull("file"); else writer.WriteString("file", d.File);
                writer.WriteNumber("line", d.Line);
                writer.WriteNumber("column", d.Column);
                writer.WriteNumber("endLine", d.EndLine);
                writer.WriteNumber("endColumn", d.EndColumn);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static string WriteRunResult(int exitCode, string? error)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteNumber("exitCode", exitCode);
            if (error is null) writer.WriteNull("error"); else writer.WriteString("error", error);
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>
    /// Renders an unhandled exception the way a console host would, but trims
    /// the stack to frames inside the student's own assembly so the reflection
    /// plumbing of the runner does not appear in the output.
    /// </summary>
    private static string Describe(Exception exception)
    {
        var sb = new StringBuilder();
        sb.Append("Unhandled exception: ");
        sb.Append(exception.GetType().FullName);
        sb.Append(": ");
        sb.Append(exception.Message);

        var stack = exception.StackTrace;
        if (!string.IsNullOrEmpty(stack))
        {
            // Everything from the first reflection frame onwards is this
            // runner invoking the entry point; frames above it are the
            // student's own call stack (including BCL frames they called into,
            // which are usually the most informative part).
            var userFrames = stack
                .Split('\n')
                .Select(line => line.TrimEnd('\r'))
                .TakeWhile(line => !line.Contains("System.RuntimeMethodHandle", StringComparison.Ordinal)
                                && !line.Contains("System.Reflection.", StringComparison.Ordinal)
                                && !line.Contains("DotNetCoder.Runner", StringComparison.Ordinal))
                .ToImmutableArray();
            foreach (var frame in userFrames)
            {
                sb.Append('\n');
                sb.Append(frame);
            }
        }

        if (exception.InnerException is not null)
        {
            sb.Append("\n ---> ");
            sb.Append(exception.InnerException.GetType().FullName);
            sb.Append(": ");
            sb.Append(exception.InnerException.Message);
        }

        return sb.ToString();
    }
}
