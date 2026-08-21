#!/usr/bin/env node
// Publishes the licence notices with the *site*, not just the repository.
//
// The MIT licence's condition attaches to the distribution, and for a web app
// the distribution is the page a student loads — so THIRD-PARTY-NOTICES.md is
// mirrored into public/ (which Vite copies verbatim into dist/) and served at
// /third-party-notices.txt. Monaco's own notices are copied straight out of
// node_modules so they cannot drift from the version actually installed.
//
// Runs as `prebuild`. The copies are committed too, so `npm run dev` serves
// them without a build step; src/utils/notices.test.ts fails if they drift.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

mkdirSync(publicDir, { recursive: true })

const source = readFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), 'utf8')
writeFileSync(join(publicDir, 'third-party-notices.txt'), source, 'utf8')
console.log('notices: wrote public/third-party-notices.txt')

// Monaco's ThirdPartyNotices.txt must be propagated along with Monaco itself.
const monacoNotices = join(root, 'node_modules', 'monaco-editor', 'ThirdPartyNotices.txt')
if (existsSync(monacoNotices)) {
  copyFileSync(monacoNotices, join(publicDir, 'monaco-third-party-notices.txt'))
  console.log('notices: wrote public/monaco-third-party-notices.txt')
} else if (existsSync(join(publicDir, 'monaco-third-party-notices.txt'))) {
  console.log('notices: monaco-editor not installed; keeping the committed copy')
} else {
  console.error('notices: monaco-editor not installed and no committed copy — run npm install')
  process.exit(1)
}
