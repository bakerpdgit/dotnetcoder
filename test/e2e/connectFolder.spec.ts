import { expect, test, type Page } from '@playwright/test'

/**
 * Connecting a folder on the student's own computer.
 *
 * This is the one action in the IDE that can change files outside the browser,
 * and since programs can now write files too, a link means their code can
 * create and overwrite things on a real disk. So the choice is put in front of
 * the user *before* the browser's folder picker opens — which also means the
 * page only ever asks for the access that was actually chosen.
 *
 * The picker itself is a native browser dialog that Playwright cannot drive, so
 * `showDirectoryPicker` is replaced with a stub that records the access mode it
 * was asked for and hands back a small in-memory folder.
 */

/** Installs a fake `showDirectoryPicker` holding one file, before the app loads. */
async function stubFolderPicker(page: Page, files: Record<string, string>): Promise<void> {
  await page.addInitScript(({ files }) => {
    const calls: string[] = []
    ;(globalThis as unknown as { __pickerCalls: string[] }).__pickerCalls = calls

    const entries = Object.entries(files).map(([name, text]) => [name, {
      kind: 'file',
      name,
      getFile: async () => new Blob([text]),
    }] as const)

    const handle = {
      kind: 'directory',
      name: 'coursework',
      [Symbol.asyncIterator]: async function* () {
        for (const entry of entries) yield entry
      },
    }

    ;(globalThis as unknown as {
      showDirectoryPicker(options?: { mode?: string }): Promise<unknown>
    }).showDirectoryPicker = async (options) => {
      calls.push(options?.mode ?? 'read')
      return handle
    }
  }, { files })
}

const pickerCalls = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { __pickerCalls: string[] }).__pickerCalls)

/** The "linked" badge in the panel header, which the banner text also matches. */
const linkedBadge = (page: Page) => page.getByTitle(/Synced with the folder/)

async function openConnectDialog(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByText('/Program.cs').first()).toBeVisible({ timeout: 30_000 })
  // The folder actions live in the filesystem panel's menu.
  await page.getByRole('button', { name: /^demo|^Default|^Files/ }).first().click()
  await page.getByRole('button', { name: /Connect a folder/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test.describe('connecting a folder', () => {
  test.beforeEach(async ({ page }) => {
    await stubFolderPicker(page, { 'notes.txt': 'coursework notes' })
  })

  test('explains what a two-way link does before opening the picker', async ({ page }) => {
    await openConnectDialog(page)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('writes to the real folder on your computer')
    await expect(dialog).toContainText('deleting a file here deletes it there')
    await expect(dialog.getByRole('button', { name: /Two-way link/ })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /One-way import/ })).toBeVisible()

    // Backing out must not reach the browser's picker at all.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(await pickerCalls(page)).toEqual([])
  })

  test('a one-way import asks only for read access and writes nothing back', async ({ page }) => {
    await openConnectDialog(page)
    await page.getByRole('dialog').getByRole('button', { name: /One-way import/ }).click()

    expect(await pickerCalls(page)).toEqual(['read'])
    await expect(page.getByText(/will not be changed/)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'notes.txt' })).toBeVisible()
    // A copy is not a link, so nothing is mirrored anywhere.
    await expect(linkedBadge(page)).toHaveCount(0)
  })

  test('a two-way link asks for write access', async ({ page }) => {
    await openConnectDialog(page)
    await page.getByRole('dialog').getByRole('button', { name: /Two-way link/ }).click()

    expect(await pickerCalls(page)).toEqual(['readwrite'])
    await expect(linkedBadge(page)).toBeVisible({ timeout: 20_000 })
  })

  test('no starter file is created in the connected folder', async ({ page }) => {
    // Writing a Program.cs into somebody's real folder because they connected
    // it is a change to their computer that they did not ask for. Run says so
    // plainly instead.
    await openConnectDialog(page)
    await page.getByRole('dialog').getByRole('button', { name: /Two-way link/ }).click()
    await expect(linkedBadge(page)).toBeVisible({ timeout: 20_000 })

    await expect(page.getByRole('button', { name: 'notes.txt' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Program.cs' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.getByText(/no \.cs files in this filesystem to run/)).toBeVisible({ timeout: 20_000 })
  })

  test('switching language does not drop a starter file into the folder either', async ({ page }) => {
    await openConnectDialog(page)
    await page.getByRole('dialog').getByRole('button', { name: /Two-way link/ }).click()
    await expect(linkedBadge(page)).toBeVisible({ timeout: 20_000 })

    await page.getByRole('combobox', { name: 'Language' }).selectOption('vb')
    await expect(page.getByRole('button', { name: 'notes.txt' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Program.vb' })).toHaveCount(0)
  })
})
