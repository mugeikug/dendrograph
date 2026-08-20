import { parseLibrary, serializeLibrary, type TreeLibrary } from '../core/library'

export interface LibraryFileHandle {
  name: string
  save(library: TreeLibrary): Promise<void>
}

function downloadFallbackHandle(suggestedName: string): LibraryFileHandle {
  return {
    name: suggestedName,
    async save(library) {
      const blob = new Blob([serializeLibrary(library)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = suggestedName
      a.click()
      URL.revokeObjectURL(url)
    },
  }
}

function handleFromFileHandle(fileHandle: FileSystemFileHandle): LibraryFileHandle {
  return {
    name: fileHandle.name,
    async save(library) {
      const writable = await fileHandle.createWritable()
      await writable.write(serializeLibrary(library))
      await writable.close()
    },
  }
}

const PICKER_TYPES: FilePickerAcceptType[] = [
  { description: 'Dendrograph リスト', accept: { 'application/json': ['.json'] } },
]

/** Opens a JSON library file. Uses the File System Access API (Chromium/Edge/WebView2)
 *  when available, so the returned handle can later overwrite the same file in place;
 *  falls back to a classic `<input type=file>` + forced download for saving otherwise.
 *  Returns null if the user cancels the picker. */
export async function openLibraryFile(): Promise<{ library: TreeLibrary; handle: LibraryFileHandle } | null> {
  if (window.showOpenFilePicker) {
    try {
      const [fileHandle] = await window.showOpenFilePicker({ types: PICKER_TYPES })
      const file = await fileHandle.getFile()
      const library = parseLibrary(await file.text())
      return { library, handle: handleFromFileHandle(fileHandle) }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
      throw e
    }
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      try {
        const library = parseLibrary(await file.text())
        resolve({ library, handle: downloadFallbackHandle(file.name) })
      } catch (e) {
        reject(e)
      }
    }
    input.click()
  })
}

/** Prompts for a new file location and writes the library there, returning a handle
 *  that can be reused to save further changes to the same file (when supported). */
export async function saveLibraryAsNewFile(
  library: TreeLibrary,
  suggestedName = 'dendrograph-list.json',
): Promise<LibraryFileHandle | null> {
  if (window.showSaveFilePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({ suggestedName, types: PICKER_TYPES })
      const handle = handleFromFileHandle(fileHandle)
      await handle.save(library)
      return handle
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
      throw e
    }
  }
  const handle = downloadFallbackHandle(suggestedName)
  await handle.save(library)
  return handle
}
