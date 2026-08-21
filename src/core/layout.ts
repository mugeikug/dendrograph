import { isTerminal, plainText, type LabelSegment, type TreeNode } from './treeModel'
import { approximateMeasureText, type MeasureText } from './textWidth'
import { renderMathToSvg } from './mathRender'

export interface LayoutOptions {
  fontSize: number
  /** Vertical distance between depth rows for branching (non-terminal) nodes. */
  rowHeight: number
  siblingGap: number
  minNodeWidth: number
  /** Gap between a node's label baseline and whatever hangs below it (children edges, or a triangle). */
  labelGap: number
  /** Fixed apex-to-base height of a triangle. The triangle (and its yield text) hang
   *  below the shared terminal-row label line, so they may extend past plain sibling
   *  leaves -- this is the conventional modern rendering, not a same-baseline layout. */
  triangleHeight: number
  measureText: MeasureText
}

export const defaultLayoutOptions: LayoutOptions = {
  fontSize: 16,
  rowHeight: 56,
  siblingGap: 24,
  minNodeWidth: 24,
  labelGap: 6,
  triangleHeight: 36,
  measureText: approximateMeasureText,
}

export interface LayoutNode {
  node: TreeNode
  x: number
  y: number
  width: number
  depth: number
  children: LayoutNode[]
}

export interface LayoutResult {
  root: LayoutNode
  width: number
  height: number
  nodesByPath: Map<string, LayoutNode>
}

function hasMathSegment(segments: LabelSegment[] | undefined): boolean {
  return (segments ?? []).some((s) => s.script === 'math')
}

/** A single segment's own width -- math via MathJax's rendered width, everything else
 *  (including sub/sup, at full fontSize -- their visually-smaller rendered size was
 *  already not reflected in width even before math segments existed) via the usual
 *  `measureText`. Exported so the SVG renderer can lay out a mixed plain/math label
 *  with per-segment cursor advances that exactly match what the layout engine assumed,
 *  keeping centering consistent with the horizontal space actually reserved. */
export function measureSegmentWidth(seg: LabelSegment, opts: LayoutOptions): number {
  if (seg.script === 'math') return renderMathToSvg(seg.text, seg.display ?? false, opts.fontSize).widthPx
  return opts.measureText(seg.text, opts.fontSize)
}

/** A label containing a `$...$` segment can't be measured as one flattened string (the
 *  math segment's raw TeX source isn't display text at all) -- each segment is measured
 *  on its own instead and summed. This ignores cross-segment kerning, but the existing
 *  sub/sup handling already accepts a looser width model than true glyph metrics, so
 *  this is consistent with, not a regression from, the current level of precision. */
function measureSegmentsWidth(segments: LabelSegment[], opts: LayoutOptions): number {
  return segments.reduce((sum, seg) => sum + measureSegmentWidth(seg, opts), 0)
}

function measureLabelWidth(node: TreeNode, opts: LayoutOptions): number {
  // An unlabeled node is just a junction point -- it shouldn't reserve label-sized
  // room; its footprint is whatever its children actually need.
  if (node.label.length === 0) return 0
  const width = hasMathSegment(node.label) ? measureSegmentsWidth(node.label, opts) : opts.measureText(plainText(node.label), opts.fontSize)
  return Math.max(opts.minNodeWidth, width + 12)
}

function measureYieldWidth(node: TreeNode, opts: LayoutOptions): number {
  const segments = node.triangleYield ?? []
  const width = hasMathSegment(segments) ? measureSegmentsWidth(segments, opts) : opts.measureText(plainText(segments), opts.fontSize)
  return Math.max(opts.minNodeWidth, width + 12)
}

/** How much taller than one normal text line this node's own label is, in px (0 for an
 *  ordinary label -- the common case, where row spacing is untouched). Only a node's
 *  own label counts, not its triangle yield: yield text hanging below a triangle body
 *  is a fixed, node-local footprint already, not something that pushes the *next*
 *  depth's row down, so a tall yield formula doesn't currently get extra room reserved
 *  for it (a deliberate scope limit -- the feature-structure use case this targets is
 *  overwhelmingly on node labels, not leaf yield text). */
export function measureLabelHeight(node: TreeNode, opts: LayoutOptions): number {
  let maxHeight = 0
  for (const seg of node.label) {
    if (seg.script !== 'math') continue
    const h = renderMathToSvg(seg.text, seg.display ?? false, opts.fontSize).heightPx
    if (h > maxHeight) maxHeight = h
  }
  return maxHeight
}

/** How many row-heights below its own label a triangle's body + yield text reach.
 *  Sibling spacing must treat the triangle as occupying a footprint at each of these
 *  levels too, or a wide yield text can collide with an unrelated subtree that happens
 *  to have real nodes at that same depth. */
function triangleHangLevels(opts: LayoutOptions): number {
  const hangPx = opts.labelGap + opts.triangleHeight + opts.fontSize * 1.3
  return Math.max(1, Math.ceil(hangPx / opts.rowHeight))
}

interface Contours {
  left: number[]
  right: number[]
}

function mergeChild(
  combined: Contours,
  child: Contours,
  minSep: number,
): number {
  // Find the minimal rightward offset so `child` (shifted) doesn't overlap `combined`.
  let offset = 0
  const depthCount = Math.min(combined.right.length, child.left.length)
  for (let d = 0; d < depthCount; d++) {
    const needed = combined.right[d] + minSep - child.left[d]
    if (needed > offset) offset = needed
  }
  // extend combined arrays with the shifted child's contours
  const newLen = Math.max(combined.left.length, offset === 0 ? child.left.length : offset + child.left.length)
  for (let d = 0; d < newLen; d++) {
    const shiftedLeft = d < child.left.length ? child.left[d] + offset : undefined
    const shiftedRight = d < child.right.length ? child.right[d] + offset : undefined
    if (shiftedLeft !== undefined) {
      combined.left[d] = combined.left[d] === undefined ? shiftedLeft : Math.min(combined.left[d], shiftedLeft)
    }
    if (shiftedRight !== undefined) {
      combined.right[d] = combined.right[d] === undefined ? shiftedRight : Math.max(combined.right[d], shiftedRight)
    }
  }
  return offset
}

interface SubtreeResult {
  root: LocalNode
  contours: Contours
}

interface LocalNode {
  node: TreeNode
  localX: number
  width: number
  children: LocalNode[]
}

function buildSubtree(node: TreeNode, opts: LayoutOptions): SubtreeResult {
  const labelWidth = measureLabelWidth(node, opts)

  if (node.isTriangle) {
    const yieldWidth = measureYieldWidth(node, opts)
    const renderWidth = Math.max(labelWidth, yieldWidth)
    const local: LocalNode = { node, localX: 0, width: renderWidth, children: [] }
    const left = [-labelWidth / 2]
    const right = [labelWidth / 2]
    for (let i = 0; i < triangleHangLevels(opts); i++) {
      left.push(-yieldWidth / 2)
      right.push(yieldWidth / 2)
    }
    return { root: local, contours: { left, right } }
  }

  if (isTerminal(node)) {
    const local: LocalNode = { node, localX: 0, width: labelWidth, children: [] }
    return {
      root: local,
      contours: { left: [-labelWidth / 2], right: [labelWidth / 2] },
    }
  }

  const width = labelWidth
  const childResults = node.children.map((c) => buildSubtree(c, opts))
  const combined: Contours = { left: [], right: [] }
  const offsets: number[] = []
  for (const cr of childResults) {
    offsets.push(mergeChild(combined, cr.contours, opts.siblingGap))
  }

  const positionedChildren: LocalNode[] = childResults.map((cr, i) =>
    shiftLocal(cr.root, offsets[i]),
  )

  const firstX = positionedChildren[0].localX
  const lastX = positionedChildren[positionedChildren.length - 1].localX
  const centerX = (firstX + lastX) / 2

  const local: LocalNode = {
    node,
    localX: 0,
    width,
    children: positionedChildren.map((c) => shiftLocal(c, -centerX)),
  }

  const ownContours: Contours = { left: [-width / 2], right: [width / 2] }
  for (let d = 0; d < combined.left.length; d++) {
    ownContours.left[d + 1] = combined.left[d] - centerX
    ownContours.right[d + 1] = combined.right[d] - centerX
  }

  return { root: local, contours: ownContours }
}

function shiftLocal(n: LocalNode, dx: number): LocalNode {
  return {
    node: n.node,
    localX: n.localX + dx,
    width: n.width,
    children: n.children.map((c) => shiftLocal(c, dx)),
  }
}

function toLayoutNode(
  local: LocalNode,
  depth: number,
  offsetX: number,
  opts: LayoutOptions,
  rowY: number[],
  nodesByPath: Map<string, LayoutNode>,
): LayoutNode {
  // Every node -- leaf, triangle, or branching -- sits at its own structural depth.
  // Sisters therefore always share a height, since they share a parent and depth.
  const ln: LayoutNode = {
    node: local.node,
    x: local.localX + offsetX,
    y: rowY[depth],
    width: local.width,
    depth,
    children: local.children.map((c) => toLayoutNode(c, depth + 1, offsetX, opts, rowY, nodesByPath)),
  }
  nodesByPath.set(local.node.path, ln)
  return ln
}

/** Cumulative Y offset for each depth. Ordinarily identical to `depth * opts.rowHeight`
 *  (and exactly that when no label in the tree contains a math segment -- the loop
 *  below is then a no-op), but a depth containing an unusually tall label (e.g. a
 *  multi-row feature matrix) pushes every deeper row down to make room, rather than
 *  letting the tall label collide with its children's row. Deliberately reserves a bit
 *  more than the minimum a renderer needs (see `measureLabelHeight` call sites in
 *  `render/geometry.ts` and `export/ooxml.ts`) so small cross-renderer differences in
 *  exact clearance can never cause a visual collision. */
function computeRowY(tree: TreeNode, opts: LayoutOptions): number[] {
  const extraBelow: number[] = []
  let maxDepth = 0
  function walk(node: TreeNode, depth: number) {
    if (depth > maxDepth) maxDepth = depth
    const labelHeight = measureLabelHeight(node, opts)
    if (labelHeight > 0) {
      const needed = labelHeight + opts.labelGap + opts.fontSize * 0.5
      if (needed > (extraBelow[depth] ?? 0)) extraBelow[depth] = needed
    }
    for (const child of node.children) walk(child, depth + 1)
  }
  walk(tree, 0)

  const rowY: number[] = [0]
  for (let d = 1; d <= maxDepth; d++) {
    rowY[d] = rowY[d - 1] + Math.max(opts.rowHeight, extraBelow[d - 1] ?? 0)
  }
  return rowY
}

export function layoutTree(tree: TreeNode, options: Partial<LayoutOptions> = {}): LayoutResult {
  const opts: LayoutOptions = { ...defaultLayoutOptions, ...options }
  const { root: localRoot, contours } = buildSubtree(tree, opts)

  const minLeft = Math.min(...contours.left)
  const offsetX = -minLeft

  const rowY = computeRowY(tree, opts)
  const nodesByPath = new Map<string, LayoutNode>()
  const root = toLayoutNode(localRoot, 0, offsetX, opts, rowY, nodesByPath)

  const maxRight = Math.max(...contours.right)
  const width = maxRight - minLeft

  // Bounding height = the deepest extent any single node actually reaches: a plain
  // leaf's own label, or (for a triangle) its label plus the triangle body and yield
  // text hanging below it. Computed per-node rather than from tree depth alone, since
  // triangles now sit at their own structural row instead of being pinned to the bottom.
  let height = 0
  for (const n of nodesByPath.values()) {
    // `computeRowY` only reserves extra room for a tall math label when something sits
    // *below* it at the next depth; a leaf (or otherwise deepest) node's own tall label
    // still needs to be included in the overall bounding height, or it gets clipped.
    const mathHeight = measureLabelHeight(n.node, opts)
    const labelBottom = mathHeight > 0 ? n.y + mathHeight : n.y + opts.fontSize
    const extent = n.node.isTriangle
      ? labelBottom + opts.labelGap + opts.triangleHeight + opts.fontSize * 1.3
      : labelBottom + opts.fontSize * 0.3
    if (extent > height) height = extent
  }

  return { root, width, height, nodesByPath }
}
