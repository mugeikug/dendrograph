import { describe, expect, it } from 'vitest'
import { parseTree } from './parser'
import { defaultLayoutOptions, layoutTree } from './layout'
import { approximateMeasureText } from './textWidth'

const opts = { ...defaultLayoutOptions, measureText: approximateMeasureText }

describe('layoutTree', () => {
  it('orders sibling leaves left-to-right matching input order', () => {
    const { root } = layoutTree(parseTree('[VP saw him]'), opts)
    const [saw, him] = root.children
    expect(saw.x).toBeLessThan(him.x)
  })

  it('centers a parent over its children', () => {
    const { root } = layoutTree(parseTree('[VP saw him]'), opts)
    const [saw, him] = root.children
    expect(root.x).toBeCloseTo((saw.x + him.x) / 2, 5)
  })

  it('places every node at its own structural depth, so unrelated leaves at different depths do not share a row', () => {
    // "leaf1" is 3 levels deep (S>A>B>leaf1), "leaf2" is 2 levels deep (S>C>leaf2).
    // They are not sisters, so they must NOT be forced onto a shared bottom row.
    const { root } = layoutTree(parseTree('[S [A [B leaf1]] [C leaf2]]'), opts)
    const leaf1 = root.children[0].children[0].children[0]
    const leaf2 = root.children[1].children[0]
    expect(leaf1.y).not.toBe(leaf2.y)
    expect(leaf1.depth).toBe(3)
    expect(leaf2.depth).toBe(2)
  })

  it('places sister nodes at the same height even when one is a leaf and the other branches', () => {
    // T has a plain-leaf sister "T" and a branching sister "VP" -- both must align.
    const { root } = layoutTree(parseTree("[TP [DP△ John's mother] [T' T [VP believes]]]"), opts)
    const tPrime = root.children[1]
    const [leafT, vp] = tPrime.children
    expect(leafT.y).toBe(vp.y)
  })

  it('does not let sibling subtrees overlap horizontally', () => {
    const { root } = layoutTree(
      parseTree('[S [NP a_very_long_determiner_phrase] [VP short]]'),
      opts,
    )
    const [np, vp] = root.children
    expect(np.x + np.width / 2).toBeLessThanOrEqual(vp.x - vp.width / 2 + 0.001)
  })

  it('places a triangle node at its own structural depth, like a branching node', () => {
    const { root } = layoutTree(parseTree('[S [NP△ a b c] [VP [V runs]]]'), opts)
    const np = root.children[0] // triangle, depth 1
    const vp = root.children[1] // depth 1
    expect(np.y).toBe(vp.y)
  })

  it('does not pin a triangle to a global bottom row shared with deeper, unrelated leaves', () => {
    const { root } = layoutTree(parseTree('[S [NP△ a b c] [VP [V runs]]]'), opts)
    const np = root.children[0]
    const runs = root.children[1].children[0].children[0]
    expect(np.y).toBeLessThan(runs.y)
  })

  it('reserves horizontal space for a hanging triangle yield so it does not collide with a sibling subtree', () => {
    const { root } = layoutTree(
      parseTree('[S [NP△ a very wide yield text indeed] [VP [V x]]]'),
      opts,
    )
    const np = root.children[0]
    const v = root.children[1].children[0]
    const yieldWidth = Math.max(
      opts.minNodeWidth,
      approximateMeasureText('a very wide yield text indeed', opts.fontSize) + 12,
    )
    expect(np.x + yieldWidth / 2).toBeLessThanOrEqual(v.x - v.width / 2 + 0.001)
  })

  it('produces a non-negative bounding box with all node x within [0, width]', () => {
    const { root, width, nodesByPath } = layoutTree(
      parseTree('[S [NP the dog] [VP [V chased] [NP the cat]]]'),
      opts,
    )
    expect(root.x).toBeGreaterThanOrEqual(0)
    for (const n of nodesByPath.values()) {
      expect(n.x - n.width / 2).toBeGreaterThanOrEqual(-0.001)
      expect(n.x + n.width / 2).toBeLessThanOrEqual(width + 0.001)
    }
  })

  describe('math segments ($...$)', () => {
    it('does not change row spacing for a tree with no math segments (exact backward compatibility)', () => {
      const { root } = layoutTree(parseTree('[S [NP the] [VP runs]]'), opts)
      expect(root.children[0].y).toBe(opts.rowHeight)
      expect(root.children[0].children[0].y).toBe(opts.rowHeight * 2)
    })

    it('pushes the next depth down to fit a node whose math label is taller than one text line', () => {
      const matrixLabel = String.raw`$\begin{bmatrix} \text{CASE} & \text{nom} \\ \text{PERS} & 3 \end{bmatrix}$`
      const { root } = layoutTree(parseTree(`[S [${matrixLabel} x] [VP runs]]`), opts)
      const [tallNode, plainNode] = root.children
      // Both are at depth 1, so they still share a row...
      expect(tallNode.y).toBe(plainNode.y)
      // ...but the row below (their children) must be pushed down well past the default
      // rowHeight to clear the tall matrix, not sit at the usual 2*rowHeight.
      const tallChild = tallNode.children[0]
      expect(tallChild.y).toBeGreaterThan(opts.rowHeight * 2)
    })

    it('widens a node to fit a math segment wider than the default min width', () => {
      const { root } = layoutTree(
        parseTree(String.raw`[$\begin{bmatrix} \text{CASE} & \text{nominative} \end{bmatrix}$]`),
        opts,
      )
      expect(root.width).toBeGreaterThan(opts.minNodeWidth * 3)
    })
  })
})
