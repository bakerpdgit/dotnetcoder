import { expect, test, type Page } from '@playwright/test'
import { EXAMPLES, examplePath, exampleSource, type ExampleLanguage } from '../../src/utils/examples'

/**
 * Every example, through the real compiler.
 *
 * An example that does not compile is worse than no example at all: it is the
 * first thing a student clicks, and they have no reason to suspect the IDE
 * rather than themselves. Unit tests can check the shape of these sources but
 * not whether Roslyn accepts them, so this drives the actual runtime.
 *
 * `?runtime=main` puts the runtime on the page's own thread, where
 * `getDotnetRuntime` is reachable and the whole catalogue can be compiled in
 * one pass without clicking through the UI sixteen times.
 */

interface CompileProblem {
  path: string
  id: string
  message: string
  line: number
}

async function skipWithoutRuntime(page: Page): Promise<void> {
  const present = await page.evaluate(async () => (await fetch('/dotnet/references.json')).ok)
  test.skip(!present, 'the .NET runtime bundle is not built — run npm run build:runtime')
}

/** Compiles each source on its own and returns every error Roslyn reported. */
async function compileAll(
  page: Page,
  language: ExampleLanguage,
  units: Array<{ path: string; text: string }>,
): Promise<CompileProblem[]> {
  return page.evaluate(async ({ language, units }) => {
    const runtime = (globalThis as unknown as {
      getDotnetRuntime(id: number): {
        getAssemblyExports(name: string): Promise<Record<string, unknown>>
      } | undefined
    }).getDotnetRuntime(0)
    if (!runtime) throw new Error('the .NET runtime is not on this thread')

    const namespace = (await runtime.getAssemblyExports('DotNetCoder.Runner')) as {
      DotNetCoder: { Exports: { Compile(language: string, sourcesJson: string): string } }
    }
    const exports = namespace.DotNetCoder.Exports

    const problems: Array<{ path: string; id: string; message: string; line: number }> = []
    for (const unit of units) {
      // One example at a time: they each declare an entry point, so compiling
      // them together would report nothing but duplicate-Main errors.
      const result = JSON.parse(exports.Compile(language, JSON.stringify([unit]))) as {
        success: boolean
        diagnostics: Array<{ id: string; severity: string; message: string; line: number }>
      }
      for (const diagnostic of result.diagnostics) {
        if (diagnostic.severity !== 'error') continue
        problems.push({
          path: unit.path,
          id: diagnostic.id,
          message: diagnostic.message,
          line: diagnostic.line,
        })
      }
    }
    return problems
  }, { language, units })
}

test.describe('the bundled examples', () => {
  for (const language of ['csharp', 'vb'] as const) {
    test(`every ${language} example compiles without errors`, async ({ page }) => {
      test.setTimeout(180_000)

      await page.goto('/')
      await skipWithoutRuntime(page)
      await page.goto('/?runtime=main')
      await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 120_000 })

      const units = EXAMPLES.map(example => ({
        path: examplePath(example, language),
        text: exampleSource(example, language),
      }))

      const problems = await compileAll(page, language, units)
      expect(
        problems.map(p => `${p.path}(${p.line}): ${p.id}: ${p.message}`),
        'an example that does not compile is worse than no example at all',
      ).toEqual([])
    })
  }
})

test.describe('the Examples menu', () => {
  test('adds an example into a filesystem of its own and runs it', async ({ page }) => {
    test.setTimeout(180_000)

    await page.goto('/')
    await skipWithoutRuntime(page)
    await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 120_000 })

    // The starter Program.cs is already here, and two entry points do not
    // compile — so the menu has to ask where the example should go.
    await page.getByRole('combobox', { name: /Examples/ }).selectOption('ex3')
    await expect(page.getByRole('dialog')).toContainText('only have one Main')
    await page.getByRole('dialog').getByRole('button', { name: /filesystem of its own/ }).click()

    await expect(page.getByText('/Example3.cs', { exact: true })).toBeVisible({ timeout: 20_000 })
    // Example 3 needs no input, so Run alone is enough to prove it works.
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.locator('pre.console-line')).toContainText('Array holds 4 numbers', { timeout: 120_000 })
    await expect(page.locator('pre.console-line')).toContainText('Ada -> 37')
  })

  test('the file example really writes its files into the panel', async ({ page }) => {
    test.setTimeout(180_000)

    await page.goto('/')
    await skipWithoutRuntime(page)
    await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 120_000 })

    await page.getByRole('combobox', { name: /Examples/ }).selectOption('ex4')
    await page.getByRole('dialog').getByRole('button', { name: /filesystem of its own/ }).click()
    await expect(page.getByText('/Example4.cs', { exact: true })).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: /^Inputs/ }).click()
    await page.getByRole('textbox', { name: 'Program input' }).fill('Ada\n36\nGrace\n45\nAlan\n41\n')
    await page.getByRole('button', { name: /^Console/ }).click()

    await page.getByRole('button', { name: 'Run' }).click()
    const output = page.locator('pre.console-line')
    await expect(output).toContainText('Ada is 36, and next year will be 37', { timeout: 120_000 })
    await expect(output).toContainText('Also wrote Example4_Output/summary.txt')

    // The whole point of the example: the files it wrote are really there.
    await expect(page.getByRole('button', { name: 'Example4_Data.txt' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Example4_Output/ })).toBeVisible()
  })

  test('a VB.NET example runs too', async ({ page }) => {
    test.setTimeout(180_000)

    await page.goto('/')
    await skipWithoutRuntime(page)
    await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 120_000 })

    await page.getByRole('combobox', { name: 'Language' }).selectOption('vb')
    await expect(page.getByText('/Program.vb', { exact: true })).toBeVisible({ timeout: 20_000 })

    await page.getByRole('combobox', { name: /Examples/ }).selectOption('ex1')
    await page.getByRole('dialog').getByRole('button', { name: /filesystem of its own/ }).click()
    await expect(page.getByText('/Example1.vb', { exact: true })).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: /^Inputs/ }).click()
    await page.getByRole('textbox', { name: 'Program input' }).fill('3\n50\n')
    await page.getByRole('button', { name: /^Console/ }).click()

    await page.getByRole('button', { name: 'Run' }).click()
    const output = page.locator('pre.console-line')
    await expect(output).toContainText('Total:     150p', { timeout: 120_000 })
    // Integer division and Mod, which is where a mangled backslash would show.
    await expect(output).toContainText('That is:   1 pounds and 50p')
  })
})
