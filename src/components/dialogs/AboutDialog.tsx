import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The About box: what this is for, what it deliberately cannot do, and the
 * attribution the licences of the redistributed software require.
 *
 * It is not built on useDialogs() because that API takes a plain string
 * message; this needs headings and links. It reuses the same .modal-backdrop /
 * .modal-card styles so it stays theme-correct, and — like every dialog in this
 * app — it is never a native browser dialog.
 */

const NOTICES_URL = '/third-party-notices.txt'
const MONACO_NOTICES_URL = '/monaco-third-party-notices.txt'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="mt-1.5 space-y-1.5 text-sm text-slate-300">{children}</div>
    </section>
  )
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-emerald-400 underline decoration-emerald-400/40 underline-offset-2 hover:decoration-emerald-400"
    >
      {children}
    </a>
  )
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-card modal-card-wide" role="dialog" aria-modal="true" aria-label="About A .NET Coder">
        <h2 className="text-base font-semibold text-slate-100">
          About <span className="whitespace-nowrap">A .NET Coder</span>
        </h2>

        <Section title="What this is for">
          <p>
            A place for students to write, run and experiment with C# and VB.NET
            without installing anything. It is built for learning the language —
            trying an idea, seeing what an error message means, getting a program
            to work — and it is deliberately not a full-fledged development
            environment. Real projects belong in a real IDE such as Visual Studio
            or VS Code; this is the sketchpad you reach for first.
          </p>
        </Section>

        <Section title="What it cannot do">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="font-medium text-slate-200">No packages.</strong>{' '}
              There is no NuGet and no way to add external libraries. You have the
              .NET class library and nothing beyond it — which is plenty for
              coursework, and a hard stop for anything else.
            </li>
            <li>
              <strong className="font-medium text-slate-200">No network or files.</strong>{' '}
              <code>HttpClient</code>, sockets and real file I/O are unavailable:
              there is no server behind this, and the WebAssembly sandbox has no
              filesystem outside its own memory.
            </li>
            <li>
              <strong className="font-medium text-slate-200">No debugger yet.</strong>{' '}
              No breakpoints, no stepping. Print statements, for now.
            </li>
            <li>
              <strong className="font-medium text-slate-200">A large first load.</strong>{' '}
              The compiler and class library are around 20&nbsp;MB. The first
              visit is slow; after that the browser caches them.
            </li>
            <li>
              <strong className="font-medium text-slate-200">Chrome or Edge for folder access.</strong>{' '}
              Connecting a real folder on disk needs the File System Access API,
              which Firefox and Safari do not implement. Everything else works
              in any modern browser.
            </li>
          </ul>
        </Section>

        <Section title="Your code stays with you">
          <p>
            Nothing is uploaded anywhere. Compilation and execution both happen
            inside your own browser tab, and your files are stored locally in the
            browser. There is no account, no server-side storage and no tracking.
          </p>
        </Section>

        <Section title="Built with">
          <p>
            The{' '}
            <Link href="https://github.com/dotnet/runtime">.NET runtime and class libraries</Link>{' '}
            and the{' '}
            <Link href="https://github.com/dotnet/roslyn">Roslyn</Link>{' '}
            C#/VB compilers (MIT, © .NET Foundation and Contributors); the{' '}
            <Link href="https://github.com/microsoft/monaco-editor">Monaco Editor</Link>{' '}
            (MIT, © Microsoft Corporation) with{' '}
            <Link href="https://github.com/microsoft/vscode-codicons">Codicons</Link>{' '}
            (CC&nbsp;BY&nbsp;4.0, © Microsoft Corporation);{' '}
            <Link href="https://github.com/facebook/react">React</Link>{' '}
            (MIT, © Meta Platforms, Inc.); and{' '}
            <Link href="https://github.com/Stuk/jszip">JSZip</Link>{' '}
            (used under its MIT option). With thanks to all of them.
          </p>
          <p>
            Full licence texts:{' '}
            <Link href={NOTICES_URL}>third-party notices</Link> and{' '}
            <Link href={MONACO_NOTICES_URL}>Monaco&rsquo;s own notices</Link>.
          </p>
        </Section>

        <Section title="Trademarks">
          <p className="text-xs text-slate-400">
            .NET, Visual Basic, Visual Studio and Microsoft are trademarks of the
            Microsoft group of companies. This project is independent and is not
            affiliated with, endorsed by, or sponsored by Microsoft or the .NET
            Foundation. The name is descriptive: it is a coder for .NET.
          </p>
        </Section>

        <div className="mt-5 flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
