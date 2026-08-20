export type ScriptStyle = 'normal' | 'sub' | 'sup'

export interface LabelSegment {
  text: string
  script: ScriptStyle
}

export interface TreeNode {
  /** Stable, structural id (child-index path from the root), used as a React key
   *  and as the key for persisting manual position adjustments across re-parses. */
  path: string
  label: LabelSegment[]
  children: TreeNode[]
  isTriangle: boolean
  /** Only set when isTriangle is true: the text drawn under the triangle. */
  triangleYield?: LabelSegment[]
}

export function isTerminal(node: TreeNode): boolean {
  return node.isTriangle || node.children.length === 0
}

export function plainText(segments: LabelSegment[] | undefined): string {
  if (!segments) return ''
  return segments.map((s) => s.text).join('')
}
