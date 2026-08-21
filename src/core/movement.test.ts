import { describe, expect, it } from 'vitest'
import { parseTree } from './parser'
import { detectMovementArrows } from './movement'

describe('detectMovementArrows', () => {
  it('connects a shallow antecedent to a deeper trace, arrowhead at the antecedent', () => {
    const tree = parseTree('[CP What~1 [C\' C [IP you [I\' did [VP see t~1]]]]]')
    const arrows = detectMovementArrows(tree)
    expect(arrows).toHaveLength(1)
    // "What~1" is the CP's own first child (depth 1); "t~1" is deep inside VP.
    const what = tree.children[0]
    const trace = tree.children[1].children[1].children[1].children[1].children[1]
    expect(arrows[0].fromPath).toBe(trace.path) // deeper node = source
    expect(arrows[0].toPath).toBe(what.path) // shallower node = target/arrowhead
  })

  it('ignores a tag that appears on only one node', () => {
    const tree = parseTree('[VP see t~1]')
    expect(detectMovementArrows(tree)).toHaveLength(0)
  })

  it('ignores a tag shared by three or more nodes', () => {
    const tree = parseTree('[S [NP a~1] [VP b~1] [PP c~1]]')
    expect(detectMovementArrows(tree)).toHaveLength(0)
  })

  it('breaks a same-depth tie by direction: the later-occurring node is the source', () => {
    // Both "a~1" and "b~1" are direct children of S, i.e. the same depth.
    const tree = parseTree('[S a~1 b~1]')
    const [a, b] = tree.children
    const arrows = detectMovementArrows(tree)
    expect(arrows).toHaveLength(1)
    expect(arrows[0].fromPath).toBe(b.path) // later in the notation = source
    expect(arrows[0].toPath).toBe(a.path) // earlier = target/arrowhead
  })

  it('supports multiple independent arrows in one tree', () => {
    const tree = parseTree('[S [NP a~1] [VP see t~1] [PP to b~2] [VP2 [V go] t~2]]')
    const arrows = detectMovementArrows(tree)
    expect(arrows).toHaveLength(2)
  })

  it('produces a stable id derived from the two node paths', () => {
    const tree = parseTree('[S a~1 b~1]')
    const arrows = detectMovementArrows(tree)
    expect(arrows[0].id).toBe(`${arrows[0].fromPath}->${arrows[0].toPath}`)
  })
})
