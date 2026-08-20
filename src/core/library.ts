import type { Adjustments } from '../render/geometry'

export interface TreeEntry {
  id: string
  name: string
  input: string
  adjustments: Adjustments
}

export interface TreeLibrary {
  version: 1
  entries: TreeEntry[]
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function createEntry(name: string, input: string): TreeEntry {
  return { id: randomId(), name, input, adjustments: {} }
}

export function createEmptyLibrary(): TreeLibrary {
  return { version: 1, entries: [] }
}

export class LibraryParseError extends Error {}

export function parseLibrary(json: string): TreeLibrary {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new LibraryParseError('JSONとして読み込めませんでした')
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as { entries?: unknown }).entries)) {
    throw new LibraryParseError('ファイルの形式が正しくありません(entries 配列がありません)')
  }
  const rawEntries = (data as { entries: unknown[] }).entries
  const entries: TreeEntry[] = rawEntries.map((raw, i) => {
    const e = raw as Record<string, unknown>
    if (typeof e.input !== 'string') {
      throw new LibraryParseError(`${i + 1}番目の項目にブラケット記法(input)がありません`)
    }
    const adjustments =
      e.adjustments && typeof e.adjustments === 'object' ? (e.adjustments as Adjustments) : {}
    return {
      id: typeof e.id === 'string' ? e.id : randomId(),
      name: typeof e.name === 'string' ? e.name : `無題${i + 1}`,
      input: e.input,
      adjustments,
    }
  })
  return { version: 1, entries }
}

export function serializeLibrary(library: TreeLibrary): string {
  return JSON.stringify(library, null, 2)
}
