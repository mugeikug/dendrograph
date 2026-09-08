import { describe, expect, it } from 'vitest'
import { defaultLayoutOptions } from '../core/layout'
import { defaultArrowControlPoint, defaultElbowBusPoint, nodeGeometry, resolveArrowControlPoint, resolveConnectorBendPoint } from './geometry'

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

describe('defaultElbowBusPoint', () => {
  it('sits below the deeper (larger-y) of the two anchors, so the staple reads unambiguously コ-shaped', () => {
    const from = { x: 20, y: 200 } // deeper
    const to = { x: 300, y: 50 } // shallower
    const bus = defaultElbowBusPoint(from, to)
    expect(bus.y).toBeGreaterThan(Math.max(from.y, to.y))
  })

  it('is centered horizontally between the two anchors', () => {
    const from = { x: 20, y: 200 }
    const to = { x: 300, y: 50 }
    expect(defaultElbowBusPoint(from, to).x).toBeCloseTo((from.x + to.x) / 2, 5)
  })

  it('still sits below both anchors when they share a row', () => {
    const from = { x: 20, y: 100 }
    const to = { x: 300, y: 100 }
    expect(defaultElbowBusPoint(from, to).y).toBeGreaterThan(100)
  })
})

describe('resolveConnectorBendPoint', () => {
  const from = { x: 0, y: 200 }
  const to = { x: 100, y: 50 }

  it('dispatches to the curve control point for shape "curve"', () => {
    expect(resolveConnectorBendPoint('a->b', 'curve', from, to, {})).toEqual(defaultArrowControlPoint(from, to))
  })

  it('dispatches to the elbow bus point for shape "square"', () => {
    expect(resolveConnectorBendPoint('a->b', 'square', from, to, {})).toEqual(defaultElbowBusPoint(from, to))
  })

  it('applies a stored adjustment on top of the square shape\'s default bus point', () => {
    const def = defaultElbowBusPoint(from, to)
    const resolved = resolveConnectorBendPoint('a->b', 'square', from, to, { 'a->b': { dx: 5, dy: 9 } })
    expect(resolved).toEqual({ x: def.x + 5, y: def.y + 9 })
  })
})
