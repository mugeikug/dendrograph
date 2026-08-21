import { describe, expect, it } from 'vitest'
import { parseTree } from '../core/parser'
import { treeToForestCode } from './forest'

describe('treeToForestCode', () => {
  it('wraps a standalone tree in a forest environment by default', () => {
    const code = treeToForestCode(parseTree('[S [NP the] [VP runs]]'))
    expect(code).toMatch(/^\\begin\{forest\}/)
    expect(code.trim()).toMatch(/\\end\{forest\}$/)
  })

  it('omits the environment wrapper when standalone is false', () => {
    const code = treeToForestCode(parseTree('[S [NP the] [VP runs]]'), { standalone: false })
    expect(code).not.toContain('\\begin{forest}')
  })

  it('nests children matching the tree structure', () => {
    const code = treeToForestCode(parseTree('[S [NP the] [VP runs]]'), { standalone: false })
    expect(code).toContain('{S}')
    expect(code).toContain('{NP}')
    expect(code).toContain('{the}')
    expect(code).toContain('{VP}')
    expect(code).toContain('{runs}')
  })

  it('renders a triangle node with the "roof" option and its yield as the child', () => {
    const code = treeToForestCode(parseTree('[NP△ the very old man]'), { standalone: false })
    expect(code).toContain('roof')
    expect(code).toContain('{the very old man}')
  })

  it('renders subscript and superscript as inline math', () => {
    const code = treeToForestCode(parseTree('[NP_{i} what^*]'), { standalone: false })
    expect(code).toContain('$_{\\text{i}}$')
    const leafCode = treeToForestCode(parseTree('[what^*]'), { standalone: false })
    expect(leafCode).toContain('$^{\\text{*}}$')
  })

  it('escapes LaTeX-special characters', () => {
    // Note: a bare "_" in the input is parser syntax for subscript (tested above),
    // so it never reaches the escaper as literal text -- test with "%" and "&" instead.
    const code = treeToForestCode(parseTree('[NP 50%&more]'), { standalone: false })
    expect(code).toContain('\\%')
    expect(code).toContain('\\&')
  })

  describe('math segments ($...$)', () => {
    it('passes an inline math segment through unescaped, re-wrapped in $...$', () => {
      const code = treeToForestCode(parseTree('[$x^2$]'), { standalone: false })
      expect(code).toContain('$x^2$')
    })

    it('passes a display math segment through unescaped, re-wrapped in $$...$$', () => {
      const code = treeToForestCode(parseTree('[$$x^2$$]'), { standalone: false })
      expect(code).toContain('$$x^2$$')
    })

    it('does not escape LaTeX-reserved characters inside math source (e.g. "&", "%")', () => {
      const code = treeToForestCode(
        parseTree(String.raw`[$\begin{bmatrix} \text{CASE} & \text{nom\%} \end{bmatrix}$]`),
        { standalone: false },
      )
      expect(code).toContain(String.raw`$\begin{bmatrix} \text{CASE} & \text{nom\%} \end{bmatrix}$`)
    })
  })
})
