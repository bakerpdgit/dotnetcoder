using System.Text;

namespace DotNetCoder;

/// <summary>
/// Buffers console writes and pushes them to JavaScript a chunk at a time.
/// Writing one message per character would swamp the worker's message channel
/// on output-heavy programs.
/// </summary>
internal sealed class JsTextWriter : TextWriter
{
    private const int FlushThreshold = 4096;

    private readonly bool _isError;
    private readonly StringBuilder _buffer = new();

    public JsTextWriter(bool isError) : this(isError, "\n") { }

    /// <summary>
    /// Test seam. The line terminator is only observable independently of the
    /// host OS if it can be set to something that is nobody's platform default,
    /// so the harness constructs one with a sentinel to prove the assignment
    /// below really does update every backing store TextWriter keeps.
    /// </summary>
    internal JsTextWriter(bool isError, string newLine)
    {
        _isError = isError;

        // Fix the line terminator at "\n" instead of inheriting
        // Environment.NewLine. In the browser the runtime is Unix-like and this
        // is already what happens, but the desktop test project runs on the host
        // OS — so without this, Console.WriteLine emits "\r\n" on Windows and
        // the harness stops being a faithful simulation of the browser.
        // Everything downstream (the console panel, the SAB stdin bridge, the
        // test expectations) assumes "\n".
        //
        // This MUST go through the NewLine property. TextWriter keeps two
        // backing fields — the protected CoreNewLine char[] and a private
        // string — and different WriteLine overloads read different ones:
        // WriteLine(int) uses the array while WriteLine(string) uses the
        // string. Assigning CoreNewLine directly updates only one of them and
        // produces output whose line endings vary by overload. The property
        // setter updates both.
        //
        // Characters the student writes explicitly are passed through
        // untouched; this only governs what WriteLine appends.
        NewLine = newLine;
    }

    public override Encoding Encoding => Encoding.UTF8;

    public override void Write(char value)
    {
        _buffer.Append(value);
        if (value == '\n' || _buffer.Length >= FlushThreshold) Flush();
    }

    public override void Write(string? value)
    {
        if (string.IsNullOrEmpty(value)) return;
        _buffer.Append(value);
        if (value.Contains('\n') || _buffer.Length >= FlushThreshold) Flush();
    }

    public override void Write(char[] buffer, int index, int count)
    {
        _buffer.Append(buffer, index, count);
        if (_buffer.Length >= FlushThreshold) Flush();
        else if (Array.IndexOf(buffer, '\n', index, count) >= 0) Flush();
    }

    public override void Flush()
    {
        if (_buffer.Length == 0) return;
        var text = _buffer.ToString();
        _buffer.Clear();
        if (_isError) Host.WriteStderr(text);
        else Host.WriteStdout(text);
    }
}

/// <summary>
/// Reads stdin one line at a time from the host. Anything already buffered from
/// the current line is consumed by <see cref="Read"/>/<see cref="Peek"/> before
/// another line is requested, so mixing <c>Console.Read()</c> and
/// <c>Console.ReadLine()</c> behaves the way it does on a real console.
/// </summary>
internal sealed class JsTextReader : TextReader
{
    private readonly JsTextWriter _stdout;
    private string? _line;
    private int _pos;
    private bool _eof;

    public JsTextReader(JsTextWriter stdout) => _stdout = stdout;

    /// <summary>
    /// Clears the end-of-input latch and any half-consumed line. Called before
    /// every run: without it, a program that read to EOF would leave stdin
    /// permanently closed and every later run would see ReadLine() return null
    /// immediately.
    /// </summary>
    public void ResetStream()
    {
        _line = null;
        _pos = 0;
        _eof = false;
    }

    private bool EnsureBuffer()
    {
        if (_line is not null && _pos < _line.Length) return true;
        if (_eof) return false;
        var next = RequestLine();
        if (next is null) return false;
        _line = next + "\n";
        _pos = 0;
        return true;
    }

    private string? RequestLine()
    {
        // Flush first: a program that does Console.Write("Name? ") then
        // Console.ReadLine() must show its prompt before the UI blocks.
        _stdout.Flush();
        var next = Host.ReadLine();
        if (next is null)
        {
            _eof = true;
            _line = null;
        }
        return next;
    }

    public override int Peek() => EnsureBuffer() ? _line![_pos] : -1;

    public override int Read() => EnsureBuffer() ? _line![_pos++] : -1;

    public override string? ReadLine()
    {
        if (_line is not null && _pos < _line.Length)
        {
            var rest = _line[_pos..].TrimEnd('\n');
            _line = null;
            _pos = 0;
            return rest;
        }
        return _eof ? null : RequestLine();
    }

    public override string ReadToEnd()
    {
        var sb = new StringBuilder();
        string? line;
        while ((line = ReadLine()) is not null)
        {
            sb.Append(line);
            sb.Append('\n');
        }
        return sb.ToString();
    }
}
