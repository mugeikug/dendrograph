import type { TreeNode } from './treeModel'

export interface MovementArrow {
  id: string
  /** The tail of the arrow (arrow starts here) -- the deeper of the two tagged nodes. */
  fromPath: string
  /** The head/arrowhead of the arrow -- the shallower of the two tagged nodes. */
  toPath: string
}

interface TaggedNode {
  node: TreeNode
  depth: number
  /** Pre-order traversal index, used only to break ties when both tagged nodes are
   *  at the same depth. */
  order: number
}

/** Finds pairs of nodes sharing the same `arrowTag` (`~tag` in the notation) and
 *  returns one MovementArrow per pair. A tag shared by anything other than exactly
 *  two nodes is ignored (no arrow, no error) -- ambiguous chains are out of scope.
 *
 *  Direction: the deeper node is the source (arrow tail, typically a trace) and the
 *  shallower node is the target (arrowhead, typically the moved antecedent). When
 *  both are at the same depth, the later-occurring node (in the notation's left-to-
 *  right order) is the source and the earlier one is the target. */
export function detectMovementArrows(tree: TreeNode): MovementArrow[] {
  const byTag = new Map<string, TaggedNode[]>()
  let order = 0

  function walk(node: TreeNode, depth: number) {
    const idx = order++
    if (node.arrowTag) {
      const list = byTag.get(node.arrowTag) ?? []
      list.push({ node, depth, order: idx })
      byTag.set(node.arrowTag, list)
    }
    for (const child of node.children) walk(child, depth + 1)
  }
  walk(tree, 0)

  const arrows: MovementArrow[] = []
  for (const nodes of byTag.values()) {
    if (nodes.length !== 2) continue
    const [a, b] = nodes
    const aIsSource = a.depth !== b.depth ? a.depth > b.depth : a.order > b.order
    const from = aIsSource ? a : b
    const to = aIsSource ? b : a
    arrows.push({ id: `${from.node.path}->${to.node.path}`, fromPath: from.node.path, toPath: to.node.path })
  }
  return arrows
}
