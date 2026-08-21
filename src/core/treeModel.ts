export type ScriptStyle = 'normal' | 'sub' | 'sup' | 'math'

export interface LabelSegment {
  /** For `script: 'math'`, this is raw (unescaped) TeX math source, not display text. */
  text: string
  script: ScriptStyle
  /** Only meaningful for `script: 'math'`: `$$...$$` (display, centered/larger) vs
   *  `$...$` (inline). */
  display?: boolean
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
  /** Movement-arrow marker (`~tag`). Two nodes sharing the same tag get connected
   *  by an auto-generated arrow -- see core/movement.ts. */
  arrowTag?: string
}

export function isTerminal(node: TreeNode): boolean {
  return node.isTriangle || node.children.length === 0
}

export function plainText(segments: LabelSegment[] | undefined): string {
  if (!segments) return ''
  return segments.map((s) => s.text).join('')
}
