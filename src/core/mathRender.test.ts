import { describe, expect, it } from 'vitest'
import { renderMathToOmml, renderMathToSvg } from './mathRender'

describe('renderMathToSvg', () => {
  it('renders a simple TeX source to an embeddable <svg> with positive dimensions', () => {
    const result = renderMathToSvg('x^2', false, 16)
    expect(result.svg).toContain('<svg')
    expect(result.svg).toContain('</svg>')
    expect(result.widthPx).toBeGreaterThan(0)
    expect(result.heightPx).toBeGreaterThan(0)
  })

  it('renders the same letter with different glyph outlines than default TeX italics (upright)', () => {
    // mathStyle: 'upright' should use the plain ASCII glyph (data-c="78"), not the
    // math-italic Unicode codepoint (U+1D465) TeX mode would normally use for "x".
    const result = renderMathToSvg('x', false, 16)
    expect(result.svg).toContain('data-c="78"')
    expect(result.svg).not.toContain('data-c="1D465"')
  })

  it('memoizes identical (source, display, fontSize) calls', () => {
    const a = renderMathToSvg('a+b', false, 16)
    const b = renderMathToSvg('a+b', false, 16)
    expect(a).toBe(b)
  })

  it('renders a multi-row matrix (feature structure) without throwing', () => {
    const result = renderMathToSvg(String.raw`\begin{bmatrix} \text{CASE} & \text{nom} \\ \text{PERS} & 3 \end{bmatrix}`, true, 16)
    expect(result.svg).toContain('<svg')
    expect(result.widthPx).toBeGreaterThan(0)
  })
})

describe('renderMathToOmml', () => {
  it('produces a <m:oMath> element', () => {
    const omml = renderMathToOmml('x^2', false)
    expect(omml).toContain('<m:oMath')
    expect(omml).toContain('</m:oMath>')
  })

  it('rewrites a top-level bracket pair around a matrix into a stretchy <m:d> delimiter', () => {
    const omml = renderMathToOmml(
      String.raw`\begin{bmatrix} \text{CASE} & \text{nom} \\ \text{PERS} & 3 \end{bmatrix}`,
      true,
    )
    expect(omml).toContain('<m:d>')
    expect(omml).toContain('<m:begChr m:val="["/>')
    expect(omml).toContain('<m:endChr m:val="]"/>')
    // The plain-text "[" / "]" runs should be gone now that they're a real delimiter.
    expect(omml).not.toMatch(/<m:r><m:t[^>]*>\[<\/m:t><\/m:r>/)
  })

  it('leaves expressions without a top-level bracket pair unchanged', () => {
    const omml = renderMathToOmml('a+b', false)
    expect(omml).not.toContain('<m:d>')
  })
})
