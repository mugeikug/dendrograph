import { describe, expect, it } from 'vitest'
import { parseTree } from '../core/parser'
import { defaultLayoutOptions, layoutTree } from '../core/layout'
import { approximateMeasureText } from '../core/textWidth'
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
})
