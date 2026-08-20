import { describe, expect, it } from 'vitest'
import { defaultLayoutOptions } from '../core/layout'
import { nodeGeometry } from './geometry'

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
