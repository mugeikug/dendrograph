import type { TreeNode } from './treeModel'

export interface Connector {
  id: string
  /** The tail of the connector (line starts here) -- see the ordering note below. */
  fromPath: string
  /** The head of the connector -- see the ordering note below. */
  toPath: string
  /** The `~tag` this connector came from, used to look up its `\linestyle` (see
   *  core/lineStyle.ts) -- multiple connectors from a chain of 3+ same-tagged nodes
   *  all share the one tag's style. */
  tag: string
}

interface TaggedNode {
  node: TreeNode
  depth: number
  /** Pre-order traversal index, used only to break ties when tagged nodes are at the
   *  same depth. */
  order: number
}

/** Finds every `~tag` shared by 2 or more nodes and returns one `Connector` per
 *  adjacent pair in the chain (a tag shared by exactly 2 nodes -> 1 connector; by 3
 *  -> 2 connectors linking node1-node2 and node2-node3; and so on). A tag used by only
 *  1 node produces no connector.
 *
 *  Ordering (source -> target) within the chain, and thus which end is `fromPath` vs
 *  `toPath`: nodes are sorted deepest-first (ties broken by later notation order first
 *  -- see the movement direction convention below), then connectors link each node to
 *  the next in that sorted sequence. For a plain 2-node movement pair this reproduces
 *  the original trace -> antecedent convention: the deeper node (typically a trace) is
 *  the source and the shallower node (typically the moved antecedent) is the target.
 *  For a 3+ node successive-cyclic chain, this naturally links the deepest trace up to
 *  each intermediate trace in turn, ending at the antecedent. */
export function detectConnectors(tree: TreeNode): Connector[] {
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

  const connectors: Connector[] = []
  for (const [tag, nodes] of byTag) {
    if (nodes.length < 2) continue
    const sorted = [...nodes].sort((a, b) => (a.depth !== b.depth ? b.depth - a.depth : b.order - a.order))
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i]
      const to = sorted[i + 1]
      connectors.push({ id: `${from.node.path}->${to.node.path}`, fromPath: from.node.path, toPath: to.node.path, tag })
    }
  }
  return connectors
}
