import { DEFAULT_ASPECT_SCALE, type Adjustments, type ArrowAdjustments, type AspectScale } from '../render/geometry'

const DEFAULT_BRANCH_WIDTH_PT = 1

export interface TreeEntry {
  id: string
  name: string
  input: string
  adjustments: Adjustments
  arrowAdjustments: ArrowAdjustments
  aspectScale: AspectScale
  /** Stroke width, in pt, for this tree's own branches (not movement arrows/connectors
   *  -- those default to this same width but can be overridden per-tag via a
   *  `\linestyle` directive in the notation itself). */
  branchWidthPt: number
}

export interface TreeLibrary {
  version: 1
  entries: TreeEntry[]
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function createEntry(name: string, input: string): TreeEntry {
  return {
    id: randomId(),
    name,
    input,
    adjustments: {},
    arrowAdjustments: {},
    aspectScale: { ...DEFAULT_ASPECT_SCALE },
    branchWidthPt: DEFAULT_BRANCH_WIDTH_PT,
  }
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
    // Older saved files predate movement arrows and won't have this field.
    const arrowAdjustments =
      e.arrowAdjustments && typeof e.arrowAdjustments === 'object' ? (e.arrowAdjustments as ArrowAdjustments) : {}
    // Older saved files predate the aspect-ratio control and won't have this field.
    const rawAspect = e.aspectScale as Partial<AspectScale> | undefined
    const aspectScale: AspectScale =
      rawAspect && typeof rawAspect.x === 'number' && typeof rawAspect.y === 'number'
        ? { x: rawAspect.x, y: rawAspect.y }
        : { ...DEFAULT_ASPECT_SCALE }
    // Older saved files predate the branch-width control and won't have this field.
    const branchWidthPt = typeof e.branchWidthPt === 'number' ? e.branchWidthPt : DEFAULT_BRANCH_WIDTH_PT
    return {
      id: typeof e.id === 'string' ? e.id : randomId(),
      name: typeof e.name === 'string' ? e.name : `無題${i + 1}`,
      input: e.input,
      adjustments,
      arrowAdjustments,
      aspectScale,
      branchWidthPt,
    }
  })
  return { version: 1, entries }
}

export function serializeLibrary(library: TreeLibrary): string {
  return JSON.stringify(library, null, 2)
}
