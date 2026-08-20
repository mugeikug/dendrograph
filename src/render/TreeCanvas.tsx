import { forwardRef, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { LabelSegment } from '../core/treeModel'
import type { LayoutNode, LayoutOptions, LayoutResult } from '../core/layout'
import { nodeGeometry, resolvePos, type Adjustments, type NodeAdjustment } from './geometry'

export type { Adjustments, NodeAdjustment } from './geometry'

interface TreeCanvasProps {
  layout: LayoutResult
  options: LayoutOptions
  adjustments: Adjustments
  onAdjustNode: (path: string, adjustment: NodeAdjustment) => void
  onResetNode: (path: string) => void
  padding?: number
}

function LabelText({
  segments,
  x,
  y,
  fontSize,
}: {
  segments: LabelSegment[]
  x: number
  y: number
  fontSize: number
}) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={fontSize} fontFamily='"Times New Roman", "Yu Mincho", serif'>
      {segments.map((seg, i) => {
        if (seg.script === 'normal') return <tspan key={i}>{seg.text}</tspan>
        const dy = seg.script === 'sub' ? fontSize * 0.28 : -fontSize * 0.32
        return (
          <tspan key={i} dy={dy} fontSize={fontSize * 0.68}>
            {seg.text}
          </tspan>
        )
      })}
    </text>
  )
}

function DraggableNode({
  n,
  opts,
  adjustments,
  onAdjustNode,
  onResetNode,
}: {
  n: LayoutNode
  opts: LayoutOptions
  adjustments: Adjustments
  onAdjustNode: (path: string, adjustment: NodeAdjustment) => void
  onResetNode: (path: string) => void
}) {
  const pos = resolvePos(n, adjustments)
  const hasLabel = n.node.label.length > 0
  const g = nodeGeometry(pos.y, opts, hasLabel)
  const dragState = useRef<{ pointerId: number; startClientX: number; startClientY: number; startAdj: NodeAdjustment } | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<SVGGElement>) => {
    e.stopPropagation()
    const current = adjustments[n.node.path] ?? { dx: 0, dy: 0 }
    dragState.current = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startAdj: current }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent<SVGGElement>) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = drag.startAdj.dx + (e.clientX - drag.startClientX)
    const dy = drag.startAdj.dy + (e.clientY - drag.startClientY)
    onAdjustNode(n.node.path, { dx, dy })
  }

  const handlePointerUp = (e: ReactPointerEvent<SVGGElement>) => {
    if (dragState.current?.pointerId === e.pointerId) dragState.current = null
  }

  // Generous invisible hit area covering the label (and triangle body, if any).
  const hitTop = g.topY - 4
  const hitBottom = n.node.isTriangle ? g.triangleBaseY + opts.fontSize + 4 : g.labelY + 6
  const hitWidth = Math.max(n.width + 16, 32)

  return (
    <g
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onResetNode(n.node.path)
      }}
      style={{ cursor: 'grab' }}
    >
      <rect
        x={pos.x - hitWidth / 2}
        y={hitTop}
        width={hitWidth}
        height={hitBottom - hitTop}
        fill="transparent"
      />
      {hasLabel && <LabelText segments={n.node.label} x={pos.x} y={g.labelY} fontSize={opts.fontSize} />}
      {n.node.isTriangle && (
        <>
          <polygon
            points={`${pos.x},${g.triangleApexY} ${pos.x - n.width / 2},${g.triangleBaseY} ${pos.x + n.width / 2},${g.triangleBaseY}`}
            fill="none"
            stroke="black"
            strokeWidth={1.25}
          />
          {n.node.triangleYield && (
            <LabelText segments={n.node.triangleYield} x={pos.x} y={g.yieldTextY} fontSize={opts.fontSize} />
          )}
        </>
      )}
    </g>
  )
}

function TreeNodeSvg({
  n,
  opts,
  adjustments,
  onAdjustNode,
  onResetNode,
}: {
  n: LayoutNode
  opts: LayoutOptions
  adjustments: Adjustments
  onAdjustNode: (path: string, adjustment: NodeAdjustment) => void
  onResetNode: (path: string) => void
}) {
  const pos = resolvePos(n, adjustments)
  const g = nodeGeometry(pos.y, opts, n.node.label.length > 0)

  return (
    <g>
      {n.children.map((child) => {
        const childPos = resolvePos(child, adjustments)
        return (
          <line
            key={child.node.path}
            x1={pos.x}
            y1={g.childEdgeY}
            x2={childPos.x}
            y2={nodeGeometry(childPos.y, opts).topY}
            stroke="black"
            strokeWidth={1.25}
          />
        )
      })}

      <DraggableNode n={n} opts={opts} adjustments={adjustments} onAdjustNode={onAdjustNode} onResetNode={onResetNode} />

      {n.children.map((child) => (
        <TreeNodeSvg
          key={child.node.path}
          n={child}
          opts={opts}
          adjustments={adjustments}
          onAdjustNode={onAdjustNode}
          onResetNode={onResetNode}
        />
      ))}
    </g>
  )
}

export const TreeCanvas = forwardRef<SVGSVGElement, TreeCanvasProps>(function TreeCanvas(
  { layout, options, adjustments, onAdjustNode, onResetNode, padding = 24 },
  ref,
) {
  const width = layout.width + padding * 2
  const height = layout.height + padding * 2

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: 'white' }}
    >
      <g transform={`translate(${padding}, ${padding})`}>
        <TreeNodeSvg
          n={layout.root}
          opts={options}
          adjustments={adjustments}
          onAdjustNode={onAdjustNode}
          onResetNode={onResetNode}
        />
      </g>
    </svg>
  )
})
