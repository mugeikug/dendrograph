import { describe, expect, it } from 'vitest'
import { ParseError, parseTree } from './parser'
import { plainText } from './treeModel'

describe('parseTree', () => {
  it('parses a basic labeled-bracket tree with explicit leaf brackets', () => {
    const tree = parseTree('[S [NP the] [VP runs]]')
    expect(plainText(tree.label)).toBe('S')
    expect(tree.children).toHaveLength(2)
    expect(plainText(tree.children[0].label)).toBe('NP')
    expect(plainText(tree.children[0].children[0].label)).toBe('the')
    expect(plainText(tree.children[1].label)).toBe('VP')
    expect(plainText(tree.children[1].children[0].label)).toBe('runs')
  })

  it('splits bare word runs into individual sibling leaves', () => {
    const tree = parseTree('[VP saw him]')
    expect(tree.children).toHaveLength(2)
    expect(plainText(tree.children[0].label)).toBe('saw')
    expect(plainText(tree.children[1].label)).toBe('him')
    expect(tree.children[0].children).toHaveLength(0)
  })

  it('mixes bracketed and bare-word children', () => {
    const tree = parseTree('[VP said [CP that it rains]]')
    expect(tree.children).toHaveLength(2)
    expect(plainText(tree.children[0].label)).toBe('said')
    expect(plainText(tree.children[1].label)).toBe('CP')
    expect(tree.children[1].children).toHaveLength(3)
  })

  it('recognizes a triangle node marked with "△" and captures its yield', () => {
    const tree = parseTree('[S [NP△ the very old man] [VP runs]]')
    const np = tree.children[0]
    expect(np.isTriangle).toBe(true)
    expect(plainText(np.label)).toBe('NP')
    expect(plainText(np.triangleYield)).toBe('the very old man')
    expect(np.children).toHaveLength(0)
  })

  it('recognizes a triangle node marked with "!"', () => {
    const tree = parseTree('[NP! a dog]')
    expect(tree.isTriangle).toBe(true)
    expect(plainText(tree.label)).toBe('NP')
    expect(plainText(tree.triangleYield)).toBe('a dog')
  })

  it('parses subscript/superscript with and without braces', () => {
    const tree = parseTree('[NP_{i} what^*]')
    expect(tree.label).toEqual([
      { text: 'NP', script: 'normal' },
      { text: 'i', script: 'sub' },
    ])
    const leaf = tree.children[0]
    expect(leaf.label).toEqual([
      { text: 'what', script: 'normal' },
      { text: '*', script: 'sup' },
    ])
  })

  it('treats a "{...}" label as one literal token, spaces included, with no "_" prefix needed', () => {
    const tree = parseTree('[{a very long label} [NP the]]')
    expect(plainText(tree.label)).toBe('a very long label')
    expect(tree.label.every((s) => s.script === 'normal')).toBe(true)
  })

  it('accepts "{...}" for a leaf word too, not just labels', () => {
    const tree = parseTree('[VP {a very long verb phrase}]')
    expect(tree.children).toHaveLength(1)
    expect(plainText(tree.children[0].label)).toBe('a very long verb phrase')
  })

  it('still parses nested "_{...}"/"^{...}" inside a "{...}"-grouped label', () => {
    const tree = parseTree('[{NP_{i} and more}]')
    expect(tree.label).toEqual([
      { text: 'NP', script: 'normal' },
      { text: 'i', script: 'sub' },
      { text: ' and more', script: 'normal' },
    ])
  })

  it('throws ParseError on an unmatched "{"', () => {
    expect(() => parseTree('[{unterminated [NP the]]')).toThrow(ParseError)
  })

  it('treats a space directly after "[" as "no label": bare words become children, not the label', () => {
    const tree = parseTree('[ a_{1} dog^{*}]')
    expect(tree.label).toEqual([])
    expect(tree.children).toHaveLength(2)
    expect(tree.children[0].label).toEqual([
      { text: 'a', script: 'normal' },
      { text: '1', script: 'sub' },
    ])
    expect(tree.children[1].label).toEqual([
      { text: 'dog', script: 'normal' },
      { text: '*', script: 'sup' },
    ])
  })

  it('treats no space after "[" as "labeled": the first token is the label, not a child', () => {
    const tree = parseTree('[a_{1} dog^{*}]')
    expect(tree.label).toEqual([
      { text: 'a', script: 'normal' },
      { text: '1', script: 'sub' },
    ])
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].label).toEqual([
      { text: 'dog', script: 'normal' },
      { text: '*', script: 'sup' },
    ])
  })

  it('allows an unlabeled non-terminal node', () => {
    const tree = parseTree('[[NP the] [VP runs]]')
    expect(tree.label).toEqual([])
    expect(tree.isTriangle).toBe(false)
    expect(tree.children).toHaveLength(2)
    expect(plainText(tree.children[0].label)).toBe('NP')
    expect(plainText(tree.children[1].label)).toBe('VP')
  })

  it('allows an unlabeled non-terminal node nested inside a labeled tree', () => {
    const tree = parseTree('[S [[NP the] [VP runs]]]')
    const unlabeled = tree.children[0]
    expect(unlabeled.label).toEqual([])
    expect(unlabeled.children).toHaveLength(2)
  })

  it('assigns stable child-index paths', () => {
    const tree = parseTree('[S [NP the] [VP runs]]')
    expect(tree.path).toBe('0')
    expect(tree.children[0].path).toBe('0-0')
    expect(tree.children[1].path).toBe('0-1')
  })

  it('throws ParseError on unclosed brackets', () => {
    expect(() => parseTree('[S [NP the]')).toThrow(ParseError)
  })

  it('throws ParseError on empty input', () => {
    expect(() => parseTree('   ')).toThrow(ParseError)
  })

  it('throws ParseError when input does not start with "["', () => {
    expect(() => parseTree('S NP the')).toThrow(ParseError)
  })

  describe('arrow tags (~)', () => {
    it('extracts an arrow tag from a labeled node', () => {
      const tree = parseTree('[NP~1 the dog]')
      expect(tree.arrowTag).toBe('1')
      expect(plainText(tree.label)).toBe('NP')
    })

    it('extracts an arrow tag from a bare leaf word', () => {
      const tree = parseTree('[VP see t~1]')
      const trace = tree.children[1]
      expect(trace.arrowTag).toBe('1')
      expect(plainText(trace.label)).toBe('t')
    })

    it('does not set arrowTag when there is no "~"', () => {
      const tree = parseTree('[NP the]')
      expect(tree.arrowTag).toBeUndefined()
    })

    it('supports a "{...}"-braced tag containing spaces', () => {
      const tree = parseTree('[VP see t~{agentive subject}]')
      const trace = tree.children[1]
      expect(trace.arrowTag).toBe('agentive subject')
      expect(plainText(trace.label)).toBe('t')
    })

    it('does not let a space inside a braced tag terminate the token early', () => {
      // Without brace-aware scanning, "t~{agentive" and "subject}" would become
      // two separate (broken) leaves instead of one.
      const tree = parseTree('[VP see t~{agentive subject}]')
      expect(tree.children).toHaveLength(2)
    })

    it('unescapes "\\~" as a literal tilde instead of treating it as the marker', () => {
      const tree = parseTree('[NP a\\~b]')
      const leaf = tree.children[0]
      expect(plainText(leaf.label)).toBe('a~b')
      expect(leaf.arrowTag).toBeUndefined()
    })

    it('combines with a triangle marker in the order "label△~tag"', () => {
      const tree = parseTree('[NP△~1 a very old man]')
      expect(tree.isTriangle).toBe(true)
      expect(tree.arrowTag).toBe('1')
      expect(plainText(tree.label)).toBe('NP')
      expect(plainText(tree.triangleYield)).toBe('a very old man')
    })

    it('does not apply the triangle marker to a bare leaf word (only to bracketed labels)', () => {
      // "!" and "△" must stay usable as ordinary leaf text/punctuation.
      const tree = parseTree('[VP Stop!]')
      const leaf = tree.children[0]
      expect(leaf.isTriangle).toBe(false)
      expect(plainText(leaf.label)).toBe('Stop!')
    })
  })

  describe('math segments ($...$)', () => {
    it('extracts an inline $...$ span as a single math segment with the raw TeX source', () => {
      const tree = parseTree('[$x^2$]')
      expect(tree.label).toEqual([{ text: 'x^2', script: 'math', display: false }])
    })

    it('extracts a display $$...$$ span with display:true', () => {
      const tree = parseTree('[$$x^2$$]')
      expect(tree.label).toEqual([{ text: 'x^2', script: 'math', display: true }])
    })

    it('keeps a $...$ span containing top-level whitespace and [ ] as one atomic token', () => {
      const tree = parseTree(String.raw`[$\begin{bmatrix} \text{CASE} & \text{nom} \end{bmatrix}$]`)
      expect(tree.label).toEqual([
        { text: String.raw`\begin{bmatrix} \text{CASE} & \text{nom} \end{bmatrix}`, script: 'math', display: false },
      ])
    })

    it('mixes plain text and math segments in one label, preserving order', () => {
      // Wrapped in {} so the spaces stay part of one label instead of splitting into
      // separate sibling leaves (the existing multi-word-label convention).
      const tree = parseTree('[{a $x$ b}]')
      expect(tree.label).toEqual([
        { text: 'a ', script: 'normal' },
        { text: 'x', script: 'math', display: false },
        { text: ' b', script: 'normal' },
      ])
    })

    it('still applies _{}/^{} to the plain-text portions around a math segment', () => {
      const tree = parseTree('[{NP_{1} $x$}]')
      expect(tree.label).toEqual([
        { text: 'NP', script: 'normal' },
        { text: '1', script: 'sub' },
        { text: ' ', script: 'normal' },
        { text: 'x', script: 'math', display: false },
      ])
    })

    it('unescapes \\$ to a literal "$" outside of math mode, without starting a math span', () => {
      const tree = parseTree(String.raw`[VP \$5]`)
      expect(plainText(tree.children[0].label)).toBe('$5')
    })

    it('treats an unterminated "$" as literal text rather than throwing', () => {
      const tree = parseTree('[VP $5]')
      expect(plainText(tree.children[0].label)).toBe('$5')
    })

    it('applies to bare leaf words, not just bracketed labels', () => {
      const tree = parseTree('[VP $x$]')
      const leaf = tree.children[0]
      expect(leaf.label).toEqual([{ text: 'x', script: 'math', display: false }])
    })

    it('applies to triangle yield text', () => {
      const tree = parseTree('[NP△ $x$ and $y$]')
      expect(tree.triangleYield).toEqual([
        { text: 'x', script: 'math', display: false },
        { text: ' and ', script: 'normal' },
        { text: 'y', script: 'math', display: false },
      ])
    })
  })
})
