# Third-party software notices and information

This project — *A .NET Coder* — is distributed under the MIT licence (see
[`LICENSE`](LICENSE)). It also **redistributes** software written by other
people, both in the repository and in the built site that is served to
students' browsers. Their licences are reproduced below, in full, as those
licences require.

Nothing here is copyleft. Every component permits free redistribution,
including at no charge and including in a commercial setting, provided the
notices below travel with the software. That is what this file is for.

A plain-text copy of this file is served alongside the app at
`/third-party-notices.txt`, so that the notices reach the people who use the
site and not only the people who read the repository. `scripts/copy-notices.mjs`
keeps that copy — and Monaco's own notices at `/monaco-third-party-notices.txt`
— in step with the originals; it runs automatically as part of `npm run build`.

## Trademarks

.NET, Visual Studio, Visual Basic, Windows and Microsoft are trademarks of the
Microsoft group of companies. The MIT licences below grant rights in copyright
only; they grant no rights in any trademark. This project is an independent
piece of work. It is **not affiliated with, endorsed by, or sponsored by
Microsoft or the .NET Foundation**, and the name "A .NET Coder" is used
descriptively — it is a coder for .NET — not as a brand.

## What is redistributed

| Component | Used for | Licence | Copyright |
|---|---|---|---|
| [.NET runtime and class libraries](https://github.com/dotnet/runtime) — `dotnet.js`, `dotnet.native.wasm` and ~180 managed assemblies under `public/dotnet/_framework/` | Executing student code in the browser | MIT | © .NET Foundation and Contributors |
| [Roslyn](https://github.com/dotnet/roslyn) — `Microsoft.CodeAnalysis.*` | Compiling C# and VB.NET, in the browser | MIT | © .NET Foundation and Contributors |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | The code editor | MIT | © 2016 – present Microsoft Corporation |
| [Codicons](https://github.com/microsoft/vscode-codicons) — `codicon.ttf`, shipped by Monaco | Editor icons | **CC BY 4.0** | © Microsoft Corporation |
| [`@monaco-editor/react`](https://github.com/suren-atoyan/monaco-react) | React binding for Monaco | MIT | © 2018 Suren Atoyan |
| [React and React-DOM](https://github.com/facebook/react) | The user interface | MIT | © Meta Platforms, Inc. and affiliates |
| [JSZip](https://github.com/Stuk/jszip) | Importing and exporting project `.zip` files | Dual **MIT** or GPL-3.0-or-later — **this project takes the MIT option** | © 2009 – 2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso |

Monaco carries its own third-party notices, covering code it in turn borrows
(the Node.js `path` library, TypeScript, js-beautify, and the language
grammars). Those notices are reproduced verbatim in
`node_modules/monaco-editor/ThirdPartyNotices.txt` and are published with the
site at `/monaco-third-party-notices.txt`.

### Build-time only

Vite, TypeScript, Tailwind CSS, PostCSS, Autoprefixer, Vitest, Playwright and
Testing Library are all MIT-licensed. None of their code is served to students —
they build and test the site rather than run in it — so they impose no
redistribution obligation here. They are named for completeness, with thanks.

---

## The MIT licence

The following components are all licensed under the MIT licence, whose text is
reproduced once below: the .NET runtime and class libraries, Roslyn, the Monaco
Editor, `@monaco-editor/react`, React, React-DOM, and JSZip (under the MIT half
of its dual licence). Their copyright notices are listed in the table above and
repeated here:

```
Copyright (c) .NET Foundation and Contributors
Copyright (c) 2016 - present Microsoft Corporation
Copyright (c) 2018 Suren Atoyan
Copyright (c) Meta Platforms, Inc. and affiliates
Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger,
              António Afonso
```

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Codicons — Creative Commons Attribution 4.0 International

The icon font `codicon.ttf`, which Monaco bundles and which this site therefore
serves, is licensed separately from Monaco's own code:

> Copyright (c) Microsoft Corporation
>
> The icons in this font are licensed under the Creative Commons Attribution
> 4.0 International Public License (CC BY 4.0).
> <https://creativecommons.org/licenses/by/4.0/>

CC BY 4.0 requires attribution, which this file and the site's **About** dialog
provide. The full licence text is at
<https://creativecommons.org/licenses/by/4.0/legalcode>.

## JSZip — a note on the dual licence

JSZip is offered under *either* the MIT licence *or* the GPL v3, at the choice
of the user. **This project chooses the MIT licence**, whose text appears above.
No GPL obligations therefore attach to this project or to anything built from
it.

## A note on the .NET runtime being redistributed at all

Serving a compiled .NET WebAssembly application as static files is the ordinary,
supported way to deploy .NET in a browser — it is what every published Blazor
WebAssembly app does. The runtime assets under `public/dotnet/` are the output
of `dotnet publish` for the `browser-wasm` target, and they are MIT-licensed,
which is what permits them to be republished here. No Microsoft service is
called at runtime and no Microsoft API terms are accepted by using this site.
