import type { LayoutNode, LayoutOptions } from '../core/layout'

export interface NodeAdjustment {
  dx: number
  dy: number
}

export type Adjustments = Record<string, NodeAdjustment>

export function resolvePos(n: LayoutNode, adjustments: Adjustments): { x: number; y: number } {
  const adj = adjustments[n.node.path]
  return { x: n.x + (adj?.dx ?? 0), y: n.y + (adj?.dy ?? 0) }
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
