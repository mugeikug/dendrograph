import { describe, expect, it } from 'vitest'
import { defaultLayoutOptions } from '../core/layout'
import { defaultArrowControlPoint, nodeGeometry, resolveArrowControlPoint } from './geometry'

describe('nodeGeometry', () => {
  it('places the label a fontSize below topY and the child-edge start below that, by default', () => {
    const g = nodeGeometry(100, defaultLayoutOptions)
    expect(g.labelY).toBe(100 + defaultLayoutOptions.fontSize)
    expect(g.childEdgeY).toBe(g.labelY + defaultLayoutOptions.labelGap)
  })

  it('collapses the label row entirely when hasLabel is false: incoming and outgoing edges meet at topY', () => {
    const g = nodeGeometry(100, defaultLayoutOptions, false)
    expect(g.labelY).toBe(100)
    expect(g.childEdgeY).toBe(100)
    expect(g.topY).toBe(100)
  })
})

describe('defaultArrowControlPoint', () => {
  it('sits on the x-midpoint and bulges downward (larger y) past the y-midpoint of the two anchors', () => {
    const from = { x: 0, y: 200 }
    const to = { x: 100, y: 50 }
    const c = defaultArrowControlPoint(from, to)
    expect(c.x).toBeCloseTo((from.x + to.x) / 2, 5)
    expect(c.y).toBeGreaterThan((from.y + to.y) / 2)
  })
})

describe('resolveArrowControlPoint', () => {
  it('returns the default control point when no adjustment exists', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 100, y: 0 }
    const def = defaultArrowControlPoint(from, to)
    const resolved = resolveArrowControlPoint('a->b', from, to, {})
    expect(resolved).toEqual(def)
  })

  it('applies a stored {dx,dy} adjustment as an offset from the default', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 100, y: 0 }
    const def = defaultArrowControlPoint(from, to)
    const resolved = resolveArrowControlPoint('a->b', from, to, { 'a->b': { dx: 10, dy: -20 } })
    expect(resolved).toEqual({ x: def.x + 10, y: def.y - 20 })
  })
})
