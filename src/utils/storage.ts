import type { LanguageId, Theme } from '../types'
import { getLanguage, isLanguageId } from './languages'

const THEME_KEY = 'dotnetcoder_theme'
const LANGUAGE_KEY = 'dotnetcoder_language'
const LAYOUT_KEY = 'dotnetcoder_layout'
const ACTIVE_FS_KEY = 'dotnetcoder_active_fs'
const ARGS_KEY = 'dotnetcoder_run_args'
const INPUT_KEY = 'dotnetcoder_fixed_input'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* private mode / quota */ }
}

export function loadTheme(): Theme {
  return read(THEME_KEY) === 'light' ? 'light' : 'dark'
}

export function saveTheme(theme: Theme): void {
  write(THEME_KEY, theme)
}

export function loadLanguage(): LanguageId {
  const stored = read(LANGUAGE_KEY)
  // A language that has since been hidden would leave the picker showing
  // something the user cannot select or run, so fall back.
  if (stored && isLanguageId(stored) && !getLanguage(stored).hidden) return stored
  return 'csharp'
}

export function saveLanguage(language: LanguageId): void {
  write(LANGUAGE_KEY, language)
}

export function loadActiveFilesystem(): string | null {
  return read(ACTIVE_FS_KEY)
}

export function saveActiveFilesystem(id: string): void {
  write(ACTIVE_FS_KEY, id)
}

export function loadRunArgs(): string {
  return read(ARGS_KEY) ?? ''
}

export function saveRunArgs(args: string): void {
  write(ARGS_KEY, args)
}

/** Text of the Inputs tab: one line per Console.ReadLine() call. */
export function loadFixedInput(): string {
  return read(INPUT_KEY) ?? ''
}

export function saveFixedInput(text: string): void {
  write(INPUT_KEY, text)
}

/**
 * Splits the Inputs box into the lines a program will read. A trailing newline
 * is not an extra empty line — but a blank line in the middle is deliberate,
 * because a program may legitimately read an empty response.
 */
export function toInputLines(text: string): string[] {
  if (text === '') return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

export interface LayoutPrefs {
  sidebarWidth: number
  consoleHeight: number
  sidebarCollapsed: boolean
}

export const DEFAULT_LAYOUT: LayoutPrefs = {
  sidebarWidth: 260,
  consoleHeight: 240,
  sidebarCollapsed: false,
}

export function loadLayout(): LayoutPrefs {
  const raw = read(LAYOUT_KEY)
  if (!raw) return { ...DEFAULT_LAYOUT }
  try {
    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>
    return {
      sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : DEFAULT_LAYOUT.sidebarWidth,
      consoleHeight: typeof parsed.consoleHeight === 'number' ? parsed.consoleHeight : DEFAULT_LAYOUT.consoleHeight,
      sidebarCollapsed: parsed.sidebarCollapsed === true,
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export function saveLayout(layout: LayoutPrefs): void {
  write(LAYOUT_KEY, JSON.stringify(layout))
}
