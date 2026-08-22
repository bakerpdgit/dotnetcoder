import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * These run against `dist/`, built *without* the .NET runtime bundle in CI's
 * default path, so they cover the two things that must never regress:
 *   1. the IDE shell loads, mounts Monaco and shows the starter file;
 *   2. a missing runtime produces a readable instruction, not a white screen.
 *
 * If public/dotnet/ has been built, the runtime tests at the bottom also run.
 */

function collectProblems(page: Page) {
  const problems: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

/** Console/page errors that are expected when the runtime bundle is absent. */
const EXPECTED = [
  /dotnet\.js/i,
  /404/,
  /Failed to load resource/i,
  /runtime bundle/i,
  /build:runtime/i,
]

test('the IDE shell loads and shows the C# starter file', async ({ page }) => {
  const problems = collectProblems(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Coder/ })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('csharp')
  await expect(page.getByText('/Program.cs').first()).toBeVisible({ timeout: 20_000 })

  // Monaco mounted and has the template in it.
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.view-lines')).toContainText('Hello, World!', { timeout: 20_000 })

  const unexpected = problems.filter(p => !EXPECTED.some(re => re.test(p)))
  expect(unexpected, `unexpected console output:\n${unexpected.join('\n')}`).toEqual([])
})

test('the language picker switches to VB.NET and creates a starter file', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.view-lines')).toContainText('Hello, World!', { timeout: 20_000 })

  await page.getByRole('combobox', { name: 'Language' }).selectOption('vb')

  await expect(page.getByText('/Program.vb').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.view-lines')).toContainText('End Module', { timeout: 20_000 })
})

test('a missing runtime bundle is explained rather than silently failing', async ({ page }) => {
  await page.goto('/')

  const runtimePresent = await page.evaluate(async () => {
    const response = await fetch('/dotnet/references.json')
    return response.ok
  })
  test.skip(runtimePresent, 'the .NET runtime bundle is present, so this failure path cannot occur')

  // Two messages carry the instruction once the worker falls back to the main
  // thread — the worker's own note and the main thread's fatal error — so match
  // the first rather than demanding the locator be unique.
  await expect(page.getByText(/npm run build:runtime/).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Restart' })).toBeEnabled()
})

test('the page is cross-origin isolated so stdin can block', async ({ page }) => {
  await page.goto('/')
  // Without these headers SharedArrayBuffer is unavailable and
  // Console.ReadLine() cannot work. Getting them wrong is silent and easy.
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true)
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function')
  await expect(page.getByText(/not cross-origin isolated/i)).toHaveCount(0)
})

test('the language picker offers only languages that can run', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.view-lines')).toContainText('Hello, World!', { timeout: 20_000 })

  // F# is parked until FSharp.Compiler.Service is wired up; offering a language
  // that cannot run is worse than not offering it.
  const options = page.getByRole('combobox', { name: 'Language' }).locator('option')
  await expect(options).toHaveText([/C#/, /VB\.NET/])
})

test('the Inputs tab holds pre-supplied stdin and survives a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.view-lines')).toContainText('Hello, World!', { timeout: 20_000 })

  await page.getByRole('button', { name: /^Inputs/ }).click()
  const box = page.getByRole('textbox', { name: 'Program input' })
  await box.fill('Ada\n21\n')

  // The badge counts the lines a program will actually read.
  await expect(page.getByRole('button', { name: /^Inputs/ })).toContainText('2')

  await page.reload()
  await page.getByRole('button', { name: /^Inputs/ }).click()
  await expect(page.getByRole('textbox', { name: 'Program input' })).toHaveValue('Ada\n21\n')
})

test('the filesystem panel can create a folder and a file', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('/Program.cs').first()).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('models')
  await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click()
  await expect(page.getByRole('button', { name: /models/ })).toBeVisible()

  await page.getByRole('button', { name: 'New file' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Dog.cs')
  await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click()
  await expect(page.getByRole('button', { name: 'Dog.cs' })).toBeVisible()
})

test('the right-click menu on a file actually runs its actions', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('/Program.cs').first()).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'New file' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Scratch.cs')
  await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click()
  const file = page.getByRole('button', { name: 'Scratch.cs' })
  await expect(file).toBeVisible()

  // Rename via the context menu. A real browser dispatches mousedown before
  // click, which is exactly what used to tear the menu down mid-click.
  await file.click({ button: 'right' })
  await page.getByRole('menu').getByRole('button', { name: 'Rename…' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Renamed.cs')
  await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click()
  await expect(page.getByRole('button', { name: 'Renamed.cs' })).toBeVisible()

  // …and delete it again.
  await page.getByRole('button', { name: 'Renamed.cs' }).click({ button: 'right' })
  await page.getByRole('menu').getByRole('button', { name: 'Delete…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: 'Renamed.cs' })).toHaveCount(0)
})

test('no Program.fs is seeded now that F# is parked', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('/Program.cs').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /Program\.fs/ })).toHaveCount(0)
})
