import type { LabelSegment, TreeNode } from '../core/treeModel'

function escapeForestText(text: string): string {
  // LaTeX-special characters, plus forest's own tree-structure delimiters "[" and "]".
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}%#&_$^~])/g, (ch) => (ch === '^' || ch === '~' ? `\\${ch}{}` : `\\${ch}`))
    .replace(/\[/g, '{[}')
    .replace(/\]/g, '{]}')
}

function segmentsToLatex(segments: LabelSegment[] | undefined): string {
  if (!segments) return ''
  return segments
    .map((seg) => {
      const text = escapeForestText(seg.text)
      if (seg.script === 'sub') return `$_{\\text{${text}}}$`
      if (seg.script === 'sup') return `$^{\\text{${text}}}$`
      return text
    })
    .join('')
}

function nodeToForest(node: TreeNode, indent: string): string {
  // Labels are wrapped in {} so a literal "[" or "]" in the text (e.g. from a leaf
  // read verbatim) can't be mistaken for forest's own tree-structure brackets.
  const label = `{${segmentsToLatex(node.label)}}`
  if (node.isTriangle) {
    const yieldText = `{${segmentsToLatex(node.triangleYield)}}`
    // NOTE: `roof` is forest's linguistics-library option for drawing a triangle from
    // a node to its child; verify against an actual forest compile (see Phase 4 notes).
    return `${indent}[${label}, roof\n${indent}  [${yieldText}]\n${indent}]`
  }
  if (node.children.length === 0) {
    return `${indent}[${label}]`
  }
  const children = node.children.map((c) => nodeToForest(c, `${indent}  `)).join('\n')
  return `${indent}[${label}\n${children}\n${indent}]`
}

export interface ForestExportOptions {
  /** Wrap the tree in a standalone \begin{forest}...\end{forest} block (default)
   *  vs. just the bracket body, for pasting into an existing forest environment. */
  standalone?: boolean
}

/** Converts the tree's structure and labels (not manual on-screen positions -- forest
 *  has its own layout engine with a different model) into forest/TikZ LaTeX code. */
export function treeToForestCode(tree: TreeNode, options: ForestExportOptions = {}): string {
  const body = nodeToForest(tree, '  ')
  if (options.standalone === false) return body
  return `\\begin{forest}\n  for tree={\n    parent anchor=south,\n    child anchor=north,\n    align=center,\n    edge={-},\n  }\n${body}\n\\end{forest}`
}
