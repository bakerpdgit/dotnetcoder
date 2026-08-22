import { expect, test, type Page } from '@playwright/test'

/**
 * The virtual filesystem, as the student's program sees it.
 *
 * Until the MEMFS bridge existed the runner was handed source *text* and
 * nothing else, so `File.ReadAllText("data.txt")` looked in the .NET runtime's
 * own filesystem — which boots empty — and threw FileNotFoundException. These
 * tests cover the round trip that fixed it: read what the Files panel holds,
 * including inside folders, and save back whatever the program wrote.
 *
 * They need the runtime bundle, so they skip when public/dotnet/ is absent.
 */

const FS_ID = 'default'

interface SeedEntry {
  path: string
  type: 'file' | 'folder'
  text?: string
}

/**
 * Writes entries straight into IndexedDB.
 *
 * Going through the UI would mean typing source into Monaco, whose auto-indent
 * and bracket completion rewrite C# as it arrives — the test would be about the
 * editor rather than the filesystem. The schema here is the one
 * src/utils/virtualFS.ts creates and its unit tests pin down.
 */
async function seedFilesystem(page: Page, entries: SeedEntry[]): Promise<void> {
  await page.evaluate(async ({ fsId, entries }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('dotnetcoder-vfs')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const store = db.transaction('entries', 'readwrite').objectStore('entries')
    const byPath = store.index('byFsAndPath')

    for (const entry of entries) {
      const index = entry.path.lastIndexOf('/')
      const parentPath = index <= 0 ? '/' : entry.path.substring(0, index)
      const name = entry.path.substring(index + 1)
      const content = entry.text === undefined
        ? undefined
        : (new TextEncoder().encode(entry.text).buffer as ArrayBuffer)

      const existing = await new Promise<{ id: string } | undefined>((resolve, reject) => {
        const request = byPath.get([fsId, entry.path])
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      await new Promise<void>((resolve, reject) => {
        const request = store.put({
          id: existing?.id ?? crypto.randomUUID(),
          fsId,
          parentPath,
          path: entry.path,
          name,
          type: entry.type,
          content,
          mimeType: entry.type === 'folder' ? undefined : 'text/plain',
          size: content?.byteLength,
          modifiedAt: Date.now(),
        })
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    }
    db.close()
  }, { fsId: FS_ID, entries })
}

/** Reads one file back out of the VFS as raw bytes, or null if it is gone. */
async function readFilesystemEntry(page: Page, path: string): Promise<number[] | null> {
  return page.evaluate(async ({ fsId, path }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('dotnetcoder-vfs')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const index = db.transaction('entries', 'readonly').objectStore('entries').index('byFsAndPath')
    const entry = await new Promise<{ content?: ArrayBuffer } | undefined>((resolve, reject) => {
      const request = index.get([fsId, path])
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return entry?.content ? Array.from(new Uint8Array(entry.content)) : null
  }, { fsId: FS_ID, path })
}

const asText = (bytes: number[] | null): string | null =>
  bytes === null ? null : new TextDecoder().decode(new Uint8Array(bytes))

/** The console panel's output area, where the program's stdout lands. */
function consoleOutput(page: Page) {
  return page.locator('pre.console-line')
}

async function skipWithoutRuntime(page: Page): Promise<void> {
  const present = await page.evaluate(async () => (await fetch('/dotnet/references.json')).ok)
  test.skip(!present, 'the .NET runtime bundle is not built — run npm run build:runtime')
}

/** Waits for the runtime to finish booting, which is a multi-megabyte download. */
async function waitForReady(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 120_000 })
}

const READ_WRITE_PROGRAM = `using System;
using System.IO;

class Program
{
    static void Main()
    {
        var total = 0;
        foreach (var line in File.ReadAllLines("data/numbers.txt")) total += int.Parse(line.Trim());
        Console.WriteLine("total=" + total);

        Console.WriteLine("absolute=" + File.ReadAllText("/data/label.txt").Trim());
        Console.WriteLine("nested=" + File.ReadAllText("data/deep/inner/note.txt").Trim());

        Directory.CreateDirectory("results/nested");
        File.WriteAllText("results/nested/total.txt", "total=" + total);
        File.WriteAllBytes("results/bytes.bin", new byte[] { 0, 1, 250, 255 });
        File.Delete("data/scratch.txt");

        Console.WriteLine("done");
    }
}
`

test.describe('the virtual filesystem inside running code', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await skipWithoutRuntime(page)
  })

  // Both hosts mount the filesystem and diff it afterwards, and they do it in
  // different files — the worker in workers/runner.worker.ts, the UI thread
  // inline in hooks/useRunner.ts, because there is no message boundary to cross
  // there. Pinning each in turn is what stops the two from drifting apart.
  for (const host of ['worker', 'main'] as const) {
    test(`a program reads its data files and its writes come back into the panel (${host} runtime)`, async ({ page }) => {
      test.setTimeout(180_000)

      await seedFilesystem(page, [
        { path: '/data', type: 'folder' },
        { path: '/data/deep', type: 'folder' },
        { path: '/data/deep/inner', type: 'folder' },
        { path: '/data/numbers.txt', type: 'file', text: '1\n2\n39\n' },
        { path: '/data/label.txt', type: 'file', text: 'hello\n' },
        { path: '/data/deep/inner/note.txt', type: 'file', text: 'three deep\n' },
        { path: '/data/scratch.txt', type: 'file', text: 'delete me' },
        { path: '/Program.cs', type: 'file', text: READ_WRITE_PROGRAM },
      ])
      await page.goto(`/?runtime=${host}`)
      await waitForReady(page)

      await page.getByRole('button', { name: 'Run' }).click()

      // Reading: relative, absolute, and three folders deep.
      const console = consoleOutput(page)
      await expect(console).toContainText('total=42', { timeout: 120_000 })
      await expect(console).toContainText('absolute=hello')
      await expect(console).toContainText('nested=three deep')
      await expect(console).toContainText('done')

      // Writing: the folders the program made show up in the panel...
      await expect(page.getByRole('button', { name: /results/ })).toBeVisible({ timeout: 20_000 })

      // ...and the files landed in the filesystem, in the right folders, byte-exact.
      await expect
        .poll(async () => asText(await readFilesystemEntry(page, '/results/nested/total.txt')), { timeout: 20_000 })
        .toBe('total=42')
      expect(await readFilesystemEntry(page, '/results/bytes.bin')).toEqual([0, 1, 250, 255])

      // A file the program deleted is gone from the panel too.
      expect(await readFilesystemEntry(page, '/data/scratch.txt')).toBeNull()
    })
  }

  test('VB.NET sees the same filesystem', async ({ page }) => {
    test.setTimeout(180_000)

    await seedFilesystem(page, [
      { path: '/notes', type: 'folder' },
      { path: '/notes/greeting.txt', type: 'file', text: 'hello from vb\n' },
      { path: '/Program.vb', type: 'file', text: `Imports System.IO

Module Program
    Sub Main()
        Console.WriteLine("read=" & File.ReadAllText("notes/greeting.txt").Trim())
        File.WriteAllText("notes/echo.txt", "echoed")
    End Sub
End Module
` },
    ])
    await page.reload()
    await waitForReady(page)
    await page.getByRole('combobox').selectOption('vb')

    await page.getByRole('button', { name: 'Run' }).click()
    await expect(consoleOutput(page)).toContainText('read=hello from vb', { timeout: 120_000 })
    await expect
      .poll(async () => asText(await readFilesystemEntry(page, '/notes/echo.txt')), { timeout: 20_000 })
      .toBe('echoed')
  })

  test('a file written by one run is readable by the next', async ({ page }) => {
    test.setTimeout(180_000)

    await seedFilesystem(page, [
      { path: '/state', type: 'folder' },
      { path: '/Program.cs', type: 'file', text: `using System;
using System.IO;

class Program
{
    static void Main()
    {
        var count = File.Exists("state/count.txt") ? int.Parse(File.ReadAllText("state/count.txt")) : 0;
        count++;
        File.WriteAllText("state/count.txt", count.ToString());
        Console.WriteLine("run number " + count);
    }
}
` },
    ])
    await page.reload()
    await waitForReady(page)

    const console = consoleOutput(page)
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(console).toContainText('run number 1', { timeout: 120_000 })

    // The second run has to see the first run's file — which only works if the
    // write reached IndexedDB and was mounted again, rather than lingering in
    // the runtime's own memory.
    await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(console).toContainText('run number 2', { timeout: 60_000 })
  })

  test('deleting a file in the panel hides it from the next run', async ({ page }) => {
    test.setTimeout(180_000)

    await seedFilesystem(page, [
      { path: '/gone.txt', type: 'file', text: 'still here' },
      { path: '/Program.cs', type: 'file', text: `using System;
using System.IO;

class Program
{
    static void Main() => Console.WriteLine("exists=" + File.Exists("gone.txt"));
}
` },
    ])
    await page.reload()
    await waitForReady(page)

    const console = consoleOutput(page)
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(console).toContainText('exists=True', { timeout: 120_000 })

    // The runtime's filesystem outlives a single run, so a stale mount would
    // still report True here.
    await page.getByRole('button', { name: 'gone.txt' }).click({ button: 'right' })
    await page.getByRole('menu').getByRole('button', { name: 'Delete…' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('button', { name: 'gone.txt' })).toHaveCount(0)

    await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(console).toContainText('exists=False', { timeout: 60_000 })
  })
})
