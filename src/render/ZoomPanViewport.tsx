import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react'

interface ZoomPanViewportProps {
  contentWidth: number
  contentHeight: number
  height: number | string
  children: ReactNode
}

const MIN_SCALE = 0.05
const MAX_SCALE = 4

export function ZoomPanViewport({ contentWidth, contentHeight, height, children }: ZoomPanViewportProps) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; startPan: { x: number; y: number } } | null>(null)

  const fit = () => {
    const el = containerRef.current
    if (!el || contentWidth <= 0 || contentHeight <= 0) return
    const vw = el.clientWidth
    const vh = el.clientHeight
    // No upper cap: "fit" should use all available room, zooming in when the
    // viewport (e.g. a large popout window) is bigger than the tree's natural size.
    const s = Math.min(vw / contentWidth, vh / contentHeight)
    setScale(s)
    setPan({ x: (vw - contentWidth * s) / 2, y: (vh - contentHeight * s) / 2 })
  }

  // Fit whenever the tree's own size changes, so the whole diagram is visible by default.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fit, [contentWidth, contentHeight])

  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor)))
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragState.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startPan: pan }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragState.current
    if (!d || d.pointerId !== e.pointerId) return
    setPan({ x: d.startPan.x + (e.clientX - d.startX), y: d.startPan.y + (e.clientY - d.startY) })
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId === e.pointerId) dragState.current = null
  }

  return (
    <div>
      <div className="zoom-toolbar">
        <button type="button" onClick={fit}>
          全体表示
        </button>
        <button
          type="button"
          onClick={() => {
            setScale(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          100%
        </button>
        <span className="zoom-level">{Math.round(scale * 100)}%</span>
      </div>
      <div
        ref={containerRef}
        className="zoom-viewport"
        style={{ height }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
