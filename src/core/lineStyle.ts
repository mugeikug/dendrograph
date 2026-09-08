export type ConnectorShape = 'curve' | 'square'
export type EndMarker = 'arrow' | 'none'
export type LineType = 'solid' | 'dashed' | 'dotted'

/** Explicit style for one `~tag`, written as `\linestyle[shape, headTo, headFrom,
 *  width, lineType]{tag}` after the tree (see `parseLineStyles` in parser.ts). All 5
 *  parameters are required when a `\linestyle` directive is used -- no partial
 *  omission in this version. */
export interface LineStyleSpec {
  shape: ConnectorShape
  /** Marker at the shallower ("to") end of the connector. */
  headTo: EndMarker
  /** Marker at the deeper ("from") end of the connector. */
  headFrom: EndMarker
  widthPt: number
  lineType: LineType
}

/** What a connector with no `\linestyle` directive for its tag looks like: today's
 *  movement-arrow default (a curve, arrowhead pointing at the antecedent, solid line
 *  matching the tree's own branch width). */
export const DEFAULT_LINE_STYLE: Omit<LineStyleSpec, 'widthPt'> = {
  shape: 'curve',
  headTo: 'arrow',
  headFrom: 'none',
  lineType: 'solid',
}

export interface ResolvedLineStyle {
  shape: ConnectorShape
  headTo: EndMarker
  headFrom: EndMarker
  widthPx: number
  lineType: LineType
}

const PT_PER_PX = 3 / 4 // 1pt = 4/3 px at 96dpi

export function ptToPx(pt: number): number {
  return pt / PT_PER_PX
}

/** Resolves a tag's connector style: the explicit `\linestyle` spec if one was
 *  written for this tag, otherwise the default (curve, arrow at the antecedent end,
 *  solid, same width as the tree's branches). */
export function resolveLineStyle(
  tag: string,
  styles: Map<string, LineStyleSpec>,
  branchWidthPt: number,
): ResolvedLineStyle {
  const spec = styles.get(tag)
  return {
    shape: spec?.shape ?? DEFAULT_LINE_STYLE.shape,
    headTo: spec?.headTo ?? DEFAULT_LINE_STYLE.headTo,
    headFrom: spec?.headFrom ?? DEFAULT_LINE_STYLE.headFrom,
    widthPx: ptToPx(spec?.widthPt ?? branchWidthPt),
    lineType: spec?.lineType ?? DEFAULT_LINE_STYLE.lineType,
  }
}
