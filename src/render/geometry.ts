import type { LayoutNode, LayoutOptions, LayoutResult } from '../core/layout'

export interface NodeAdjustment {
  dx: number
  dy: number
}

export type Adjustments = Record<string, NodeAdjustment>

/** Same shape as a node adjustment (an {dx,dy} offset), stored per movement-arrow id. */
export type ArrowAdjustments = Record<string, NodeAdjustment>

/** Independent horizontal/vertical stretch factors applied to the whole tree (1 = 100%,
 *  unchanged). Lets the user squash/stretch the diagram's aspect ratio before exporting
 *  to an image or inserting into Word, without touching individual node positions. */
export interface AspectScale {
  x: number
  y: number
}

export const DEFAULT_ASPECT_SCALE: AspectScale = { x: 1, y: 1 }

/** A node's on-screen position: its (possibly manually-adjusted) layout position,
 *  stretched by the aspect-ratio scale. The scale is applied here -- to positions only
 *  -- rather than as a blanket rendering transform, so that branches/arrows visibly
 *  stretch while text and shapes keep their normal, undistorted size (only moving to
 *  follow their node). `scaleX`/`scaleY` default to 1 so existing callers that don't
 *  care about the aspect-ratio feature are unaffected. */
export function resolvePos(n: LayoutNode, adjustments: Adjustments, scaleX = 1, scaleY = 1): { x: number; y: number } {
  const adj = adjustments[n.node.path]
  return { x: (n.x + (adj?.dx ?? 0)) * scaleX, y: (n.y + (adj?.dy ?? 0)) * scaleY }
}

/** Vertical breakdown from a (possibly manually-adjusted) top-y: the label sits on a
 *  shared row, and only a triangle's body + yield text hang further down from there.
 *  An unlabeled node (hasLabel=false) has no row of its own: the incoming edge from
 *  its parent and its own outgoing edges to children all meet at exactly `topY`. */
export function nodeGeometry(topY: number, opts: LayoutOptions, hasLabel = true) {
  const labelY = hasLabel ? topY + opts.fontSize : topY
  const childEdgeY = hasLabel ? labelY + opts.labelGap : topY
  return {
    topY,
    labelY,
    childEdgeY,
    triangleApexY: childEdgeY,
    triangleBaseY: childEdgeY + opts.triangleHeight,
    yieldTextY: childEdgeY + opts.triangleHeight + opts.fontSize,
  }
}

export interface Point {
  x: number
  y: number
}

/** Where a movement arrow attaches to a node: horizontally centered, just below its
 *  own label line (whether or not that node happens to be a triangle -- the arrow
 *  always anchors to the label row, not the triangle body). */
export function arrowAnchor(
  path: string,
  layout: LayoutResult,
  adjustments: Adjustments,
  opts: LayoutOptions,
  scaleX = 1,
  scaleY = 1,
): Point {
  const n = layout.nodesByPath.get(path)
  if (!n) return { x: 0, y: 0 }
  const pos = resolvePos(n, adjustments, scaleX, scaleY)
  const g = nodeGeometry(pos.y, opts, n.node.label.length > 0)
  return { x: pos.x, y: g.labelY + 4 }
}

/** Default quadratic-bezier control point for an arrow between two anchors: the
 *  midpoint, bulged downward so the curve arcs below the direct line between them
 *  (matching the "swoop below the tree" convention for movement arrows) rather than
 *  cutting straight through whatever sits between the two nodes. The bulge is generous
 *  on purpose -- a curve that hugs the straight line almost always clips through
 *  intervening labels/branches, and a wide detour is easier to live with (or nudge in
 *  slightly by dragging) than a tight one is to pull outward. */
export function defaultArrowControlPoint(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const bulge = Math.max(70, Math.abs(dy) * 0.75, Math.abs(dx) * 0.35)
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + bulge }
}

/** The control point actually used for rendering/export: the default, shifted by
 *  whatever the user dragged (an offset, same pattern as node position adjustments). */
export function resolveArrowControlPoint(
  arrowId: string,
  from: Point,
  to: Point,
  arrowAdjustments: ArrowAdjustments,
): Point {
  const def = defaultArrowControlPoint(from, to)
  const adj = arrowAdjustments[arrowId]
  return { x: def.x + (adj?.dx ?? 0), y: def.y + (adj?.dy ?? 0) }
}
