import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileSystemPanel } from './FileSystemPanel'
import { DialogProvider } from './dialogs/DialogProvider'
import {
  DEFAULT_FS_ID, _resetDbForTests, createEntry, ensureDefaultFilesystem, getEntryByPath,
} from '../utils/virtualFS'

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

function renderPanel(overrides: Partial<Parameters<typeof FileSystemPanel>[0]> = {}) {
  const props = {
    activeFilesystemId: DEFAULT_FS_ID,
    currentPath: '/',
    openFilePath: null,
    language: 'csharp' as const,
    reloadTrigger: 0,
    isLocalFolderConnected: false,
    localFolderName: null,
    onFilesystemChange: vi.fn(),
    onPathChange: vi.fn(),
    onOpenFile: vi.fn(),
    onFileDeleted: vi.fn(),
    onFileRenamed: vi.fn(),
    onError: vi.fn(),
    onChanged: vi.fn(),
    onConnectLocalFolder: vi.fn(),
    onReloadLocalFolder: vi.fn(),
    onDisconnectLocalFolder: vi.fn(),
    onLocalFolderSync: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  render(
    <DialogProvider>
      <FileSystemPanel {...props} />
    </DialogProvider>,
  )
  return props
}

/** Right-clicks a file row and waits for its context menu. */
async function openContextMenu(user: ReturnType<typeof userEvent.setup>, fileName: string) {
  const row = await screen.findByRole('button', { name: new RegExp(fileName) })
  await user.pointer({ target: row, keys: '[MouseRight]' })
  return screen.findByRole('menu')
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  _resetDbForTests()
  await ensureDefaultFilesystem('csharp')
  await createEntry(DEFAULT_FS_ID, '/', 'Notes.cs', 'file', encode('// notes'), 'text/x-csharp')
})

describe('the file context menu', () => {
  it('runs Delete when the item is clicked', async () => {
    // Regression: the menu used to close on document mousedown with no
    // containment check, so React unmounted the button before its click event
    // could fire and every item silently did nothing.
    const user = userEvent.setup()
    const props = renderPanel()

    await openContextMenu(user, 'Notes.cs')
    await user.click(screen.getByRole('button', { name: 'Delete…' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Delete "Notes.cs"')
    await user.click(screen.getByRole('button', { name: /^Delete$/ }))

    await waitFor(async () => {
      expect(await getEntryByPath(DEFAULT_FS_ID, '/Notes.cs')).toBeNull()
    })
    expect(props.onFileDeleted).toHaveBeenCalledWith('/Notes.cs')
  })

  it('runs Rename when the item is clicked', async () => {
    const user = userEvent.setup()
    const props = renderPanel()

    await openContextMenu(user, 'Notes.cs')
    await user.click(screen.getByRole('button', { name: 'Rename…' }))

    const input = await screen.findByDisplayValue('Notes.cs')
    await user.clear(input)
    await user.type(input, 'Renamed.cs{Enter}')

    await waitFor(async () => {
      expect(await getEntryByPath(DEFAULT_FS_ID, '/Renamed.cs')).not.toBeNull()
    })
    expect(props.onFileRenamed).toHaveBeenCalledWith('/Notes.cs', '/Renamed.cs')
  })

  it('closes when the click lands outside the menu', async () => {
    const user = userEvent.setup()
    renderPanel()

    await openContextMenu(user, 'Notes.cs')
    await user.click(document.body)

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(await getEntryByPath(DEFAULT_FS_ID, '/Notes.cs')).not.toBeNull()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderPanel()

    await openContextMenu(user, 'Notes.cs')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
