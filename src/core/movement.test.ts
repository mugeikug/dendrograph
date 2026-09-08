import { describe, expect, it } from 'vitest'
import { parseTree } from './parser'
import { detectConnectors } from './movement'

describe('detectConnectors', () => {
  it('connects a shallow antecedent to a deeper trace, arrowhead at the antecedent', () => {
    const tree = parseTree('[CP What~1 [C\' C [IP you [I\' did [VP see t~1]]]]]')
    const arrows = detectConnectors(tree)
    expect(arrows).toHaveLength(1)
    // "What~1" is the CP's own first child (depth 1); "t~1" is deep inside VP.
    const what = tree.children[0]
    const trace = tree.children[1].children[1].children[1].children[1].children[1]
    expect(arrows[0].fromPath).toBe(trace.path) // deeper node = source
    expect(arrows[0].toPath).toBe(what.path) // shallower node = target/arrowhead
    expect(arrows[0].tag).toBe('1')
  })

  it('ignores a tag that appears on only one node', () => {
    const tree = parseTree('[VP see t~1]')
    expect(detectConnectors(tree)).toHaveLength(0)
  })

  it('breaks a same-depth tie by direction: the later-occurring node is the source', () => {
    // Both "a~1" and "b~1" are direct children of S, i.e. the same depth.
    const tree = parseTree('[S a~1 b~1]')
    const [a, b] = tree.children
    const arrows = detectConnectors(tree)
    expect(arrows).toHaveLength(1)
    expect(arrows[0].fromPath).toBe(b.path) // later in the notation = source
    expect(arrows[0].toPath).toBe(a.path) // earlier = target/arrowhead
  })

  it('supports multiple independent connectors in one tree', () => {
    const tree = parseTree('[S [NP a~1] [VP see t~1] [PP to b~2] [VP2 [V go] t~2]]')
    const arrows = detectConnectors(tree)
    expect(arrows).toHaveLength(2)
  })

  it('produces a stable id derived from the two node paths', () => {
    const tree = parseTree('[S a~1 b~1]')
    const arrows = detectConnectors(tree)
    expect(arrows[0].id).toBe(`${arrows[0].fromPath}->${arrows[0].toPath}`)
  })

  describe('chains of 3+ same-tagged nodes', () => {
    it('links a successive-cyclic chain deepest-first: deepest->intermediate, intermediate->shallowest', () => {
      // A 3-step chain: deep trace (depth 4) -> intermediate trace (depth 2) -> antecedent (depth 1).
      const tree = parseTree("[CP What~1 [C' C [IP t~1 [I' did [VP see t~1]]]]]")
      // NOTE: the intermediate and deep occurrences share the same literal tag "1" as the
      // antecedent, so this actually exercises 3 nodes tagged "1": What (depth 1), the
      // intermediate t (depth 2), and the deep t (depth 5).
      const connectors = detectConnectors(tree)
      expect(connectors).toHaveLength(2)
      const what = tree.children[0]
      const intermediateTrace = tree.children[1].children[1].children[0].path // C' -> IP -> its first child "t~1"
      const deepTrace = tree.children[1].children[1].children[1].children[1].children[1].path

      // The deepest pair connects the deepest trace to the intermediate trace...
      expect(connectors.some((c) => c.fromPath === deepTrace && c.toPath === intermediateTrace)).toBe(true)
      // ...and the intermediate trace connects on up to the antecedent.
      expect(connectors.some((c) => c.fromPath === intermediateTrace && c.toPath === what.path)).toBe(true)
    })

    it('gives every connector in a chain the same tag', () => {
      const tree = parseTree('[S [A a~1] [B b~1] [C c~1]]')
      const connectors = detectConnectors(tree)
      expect(connectors).toHaveLength(2)
      expect(connectors.every((c) => c.tag === '1')).toBe(true)
    })
  })
})
