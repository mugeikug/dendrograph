import { describe, expect, it } from 'vitest'
import { parseTree, parseLineStyles } from '../core/parser'
import { defaultLayoutOptions, layoutTree } from '../core/layout'
import { approximateMeasureText } from '../core/textWidth'
import { detectConnectors } from '../core/movement'
import { layoutToOoxml } from './ooxml'

const opts = { ...defaultLayoutOptions, measureText: approximateMeasureText }

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function countOpenTags(xml: string, tag: string): number {
  // Matches "<tag>" or "<tag " (with attributes) but not "<tagXxx" (e.g. "w:p" vs "w:pPr").
  const re = new RegExp(`<${tag}[ >]`, 'g')
  return (xml.match(re) ?? []).length
}

describe('layoutToOoxml', () => {
  it('produces one wps:wsp shape per edge and per label, for a tree with no triangles', () => {
    const tree = parseTree('[VP saw him]')
    const layout = layoutTree(tree, opts)
    const xml = layoutToOoxml(layout, opts, {})

    // 2 edges (VP->saw, VP->him) + 3 labels (VP, saw, him) = 5 shapes
    expect(countOccurrences(xml, '<wps:wsp>')).toBe(5)
    expect(countOccurrences(xml, '</wps:wsp>')).toBe(5)
  })

  it('adds a triangle shape and a yield-text shape for a triangle node', () => {
    const tree = parseTree('[S [NP△ the man] [VP runs]]')
    const layout = layoutTree(tree, opts)
    const xml = layoutToOoxml(layout, opts, {})

    // edges: S->NP, S->VP, VP->runs = 3
    // labels: S, NP, VP, runs = 4
    // triangle: 1, yield text: 1
    expect(countOccurrences(xml, '<wps:wsp>')).toBe(3 + 4 + 1 + 1)
    expect(xml).toContain('prst="triangle"')
  })

  it('escapes special XML characters in label text', () => {
    const tree = parseTree('[NP<script> a]')
    const layout = layoutTree(tree, opts)
    const xml = layoutToOoxml(layout, opts, {})
    expect(xml).not.toContain('<script>')
    expect(xml).toContain('&lt;script&gt;')
  })

  it('applies manual adjustments to shape positions', () => {
    const tree = parseTree('[VP saw him]')
    const layout = layoutTree(tree, opts)
    const withoutAdjust = layoutToOoxml(layout, opts, {})
    const withAdjust = layoutToOoxml(layout, opts, { '0-0': { dx: 500, dy: 0 } })
    expect(withAdjust).not.toBe(withoutAdjust)
  })

  it('renders sub/superscript runs with vertAlign', () => {
    const tree = parseTree('[NP_{i} what]')
    const layout = layoutTree(tree, opts)
    const xml = layoutToOoxml(layout, opts, {})
    expect(xml).toContain('w:val="subscript"')
  })

  it('omits the label shape for an unlabeled node', () => {
    const tree = parseTree('[[NP the] [VP runs]]')
    const layout = layoutTree(tree, opts)
    const xml = layoutToOoxml(layout, opts, {})

    // edges: root->NP, root->VP, NP->the, VP->runs = 4
    // labels: NP, VP, the, runs (NOT the unlabeled root) = 4
    expect(countOccurrences(xml, '<wps:wsp>')).toBe(4 + 4)
  })

  it('produces well-formed-looking output: every open tag among the shape elements has a matching close tag', () => {
    const tree = parseTree('[S [NP△ the very old man] [VP [V saw] [NP a_{1} dog^{*}]]]')
    const layout = layoutTree(tree, opts)
    const xml = layoutToOoxml(layout, opts, {})
    for (const tag of ['wps:wsp', 'wpg:wgp', 'a:xfrm', 'w:p', 'pkg:package']) {
      expect(countOpenTags(xml, tag)).toBe(countOccurrences(xml, `</${tag}>`))
    }
  })

  describe('aspect-ratio scale', () => {
    it('stretches node/edge positions vertically but leaves text-box and triangle sizes untouched', () => {
      const tree = parseTree('[S [NP△ the man] [VP runs]]')
      const layout = layoutTree(tree, opts)
      const unscaled = layoutToOoxml(layout, opts, {})
      const scaled = layoutToOoxml(layout, opts, {}, [], new Map(), {}, { scaleX: 1, scaleY: 2 })

      // The overall group grows taller (positions moved further apart)...
      const groupHeight = (xml: string) => Number(xml.match(/<wp:extent cx="\d+" cy="(\d+)"\/>/)![1])
      expect(groupHeight(scaled)).toBeGreaterThan(groupHeight(unscaled) * 1.5)

      // ...but every text box keeps the exact same width/height it had unscaled (text
      // itself must never be stretched, only repositioned).
      const textBoxSizes = (xml: string) => [...xml.matchAll(/<a:ext cx="(\d+)" cy="(\d+)"\/>\s*<\/a:xfrm>\s*<a:prstGeom prst="rect"/g)].map((m) => `${m[1]}x${m[2]}`)
      expect(textBoxSizes(scaled)).toEqual(textBoxSizes(unscaled))

      // ...and the triangle keeps its own height too (only its position moves).
      const triangleSize = (xml: string) => xml.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>\s*<\/a:xfrm>\s*<a:prstGeom prst="triangle"/)
      expect(triangleSize(scaled)![2]).toBe(triangleSize(unscaled)![2])
    })
  })

  describe('movement arrows / connectors', () => {
    it('adds one custGeom shape per connector, with a triangle arrowhead', () => {
      const tree = parseTree("[CP What~1 [C' C [IP you [I' did [VP see t~1]]]]]")
      const layout = layoutTree(tree, opts)
      const connectors = detectConnectors(tree)
      expect(connectors).toHaveLength(1)

      const withoutArrows = layoutToOoxml(layout, opts, {})
      const withArrows = layoutToOoxml(layout, opts, {}, connectors, new Map())

      expect(countOccurrences(withArrows, '<wps:wsp>')).toBe(countOccurrences(withoutArrows, '<wps:wsp>') + 1)
      expect(withArrows).toContain('<a:custGeom>')
      expect(withArrows).toContain('<a:quadBezTo>')
      expect(withArrows).toContain('a:tailEnd type="triangle"')
    })

    it('applies an arrow adjustment to the generated curve', () => {
      const tree = parseTree('[S a~1 b~1]')
      const layout = layoutTree(tree, opts)
      const connectors = detectConnectors(tree)
      const withoutAdjust = layoutToOoxml(layout, opts, {}, connectors, new Map())
      const withAdjust = layoutToOoxml(layout, opts, {}, connectors, new Map(), { [connectors[0].id]: { dx: 0, dy: 300 } })
      expect(withAdjust).not.toBe(withoutAdjust)
    })

    it('produces well-formed custGeom/path tags even with an arrow present', () => {
      const tree = parseTree("[CP What~1 [C' C [IP you [I' did [VP see t~1]]]]]")
      const layout = layoutTree(tree, opts)
      const connectors = detectConnectors(tree)
      const xml = layoutToOoxml(layout, opts, {}, connectors, new Map())
      for (const tag of ['wps:wsp', 'a:custGeom', 'a:path', 'a:moveTo', 'a:quadBezTo', 'a:ln']) {
        expect(countOpenTags(xml, tag)).toBe(countOccurrences(xml, `</${tag}>`))
      }
    })

    it('supports a chain of 3+ same-tagged nodes as multiple connector shapes', () => {
      const tree = parseTree('[S [A a~1] [B b~1] [C c~1]]')
      const connectors = detectConnectors(tree)
      expect(connectors).toHaveLength(2)
      const layout = layoutTree(tree, opts)
      const xml = layoutToOoxml(layout, opts, {}, connectors, new Map())
      expect(countOccurrences(xml, '<a:custGeom>')).toBe(2)
    })

    it('renders a "square" \\linestyle as a 3-segment コ-shaped staple with no arrowheads by default heads=none', () => {
      const tree = parseTree('[S a~1 b~1]\n\\linestyle[square, none, none, 1pt, solid]{1}')
      const connectors = detectConnectors(tree)
      const lineStyles = parseLineStyles('[S a~1 b~1]\n\\linestyle[square, none, none, 1pt, solid]{1}')
      const layout = layoutTree(tree, opts)
      const xml = layoutToOoxml(layout, opts, {}, connectors, lineStyles)
      expect(xml).not.toContain('<a:quadBezTo>')
      expect(countOccurrences(xml, '<a:lnTo>')).toBe(3)
      expect(xml).toContain('a:headEnd type="none"')
      expect(xml).toContain('a:tailEnd type="none"')
    })

    it('applies a custom width and dashed line type from \\linestyle', () => {
      const source = '[S a~1 b~1]\n\\linestyle[curve, arrow, none, 3pt, dashed]{1}'
      const connectors = detectConnectors(parseTree(source))
      const lineStyles = parseLineStyles(source)
      const layout = layoutTree(parseTree(source), opts)
      const xml = layoutToOoxml(layout, opts, {}, connectors, lineStyles)
      expect(xml).toContain('<a:prstDash val="dash"/>')
      // 3pt -> px -> EMU should noticeably exceed the ~1pt default branch width.
      const lnWidths = [...xml.matchAll(/<a:ln w="(\d+)">/g)].map((m) => Number(m[1]))
      expect(Math.max(...lnWidths)).toBeGreaterThan(lnWidths[0] * 2)
    })

    it('falls back to the tree\'s branch width when no \\linestyle is given for a tag', () => {
      const tree = parseTree('[S a~1 b~1]')
      const connectors = detectConnectors(tree)
      const layout = layoutTree(tree, opts)
      const xml = layoutToOoxml(layout, opts, {}, connectors, new Map())
      const branchWidthEmu = Math.round((opts.branchWidthPt / (3 / 4)) * 9525)
      expect(xml).toContain(`<a:ln w="${branchWidthEmu}">`)
    })
  })

  describe('math segments ($...$)', () => {
    it('embeds a native <m:oMath> equation for a math-only label, declaring the math namespace', () => {
      const tree = parseTree(String.raw`[$x^2$]`)
      const layout = layoutTree(tree, opts)
      const xml = layoutToOoxml(layout, opts, {})
      expect(xml).toContain('<m:oMath')
      expect(xml).toContain('xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"')
    })

    it('rewrites a bracket-wrapped feature matrix into a stretchy <m:d> delimiter', () => {
      const tree = parseTree(String.raw`[$\begin{bmatrix} \text{CASE} & \text{nom} \\ \text{PERS} & 3 \end{bmatrix}$]`)
      const layout = layoutTree(tree, opts)
      const xml = layoutToOoxml(layout, opts, {})
      expect(xml).toContain('<m:d>')
      expect(xml).toContain('<m:m>') // the OMML matrix element
    })

    it('gives the label text box a taller height to fit a multi-row matrix', () => {
      const plain = layoutToOoxml(layoutTree(parseTree('[NP the]'), opts), opts, {})
      const math = layoutToOoxml(
        layoutTree(parseTree(String.raw`[$\begin{bmatrix} \text{CASE} & \text{nom} \\ \text{PERS} & 3 \end{bmatrix}$]`), opts),
        opts,
        {},
      )
      const plainHeight = Number(plain.match(/<a:ext cx="\d+" cy="(\d+)"\/>\s*<\/a:xfrm>\s*<a:prstGeom prst="rect"/)![1])
      const mathHeight = Number(math.match(/<a:ext cx="\d+" cy="(\d+)"\/>\s*<\/a:xfrm>\s*<a:prstGeom prst="rect"/)![1])
      expect(mathHeight).toBeGreaterThan(plainHeight)
    })

    it('produces well-formed tags even with a math label present', () => {
      const tree = parseTree(String.raw`[S [$\begin{bmatrix} \text{CASE} & \text{nom} \end{bmatrix}$ x] [VP runs]]`)
      const layout = layoutTree(tree, opts)
      const xml = layoutToOoxml(layout, opts, {})
      for (const tag of ['wps:wsp', 'm:oMath', 'm:d', 'm:m', 'm:mr', 'w:p']) {
        expect(countOpenTags(xml, tag)).toBe(countOccurrences(xml, `</${tag}>`))
      }
    })
  })

  describe('\\it{} / \\bf{} inline styling', () => {
    it('renders an italic segment with <w:i/>', () => {
      const tree = parseTree('[\\it{John}]')
      const layout = layoutTree(tree, opts)
      const xml = layoutToOoxml(layout, opts, {})
      expect(xml).toContain('<w:i/>')
      expect(xml).toContain('John')
    })

    it('renders a bold segment with <w:b/>', () => {
      const tree = parseTree('[\\bf{John}]')
      const layout = layoutTree(tree, opts)
      const xml = layoutToOoxml(layout, opts, {})
      expect(xml).toContain('<w:b/>')
    })

    it('does not add <w:i/>/<w:b/> to a plain label', () => {
      const tree = parseTree('[John]')
      const layout = layoutTree(tree, opts)
      const xml = layoutToOoxml(layout, opts, {})
      expect(xml).not.toContain('<w:i/>')
      expect(xml).not.toContain('<w:b/>')
    })
  })
})
