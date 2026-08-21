import { forwardRef, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { LabelSegment } from '../core/treeModel'
import type { LayoutNode, LayoutOptions, LayoutResult } from '../core/layout'
import type { MovementArrow } from '../core/movement'
import {
  arrowAnchor,
  nodeGeometry,
  resolveArrowControlPoint,
  resolvePos,
  type Adjustments,
  type ArrowAdjustments,
  type NodeAdjustment,
} from './geometry'

export type { Adjustments, NodeAdjustment, ArrowAdjustments, AspectScale } from './geometry'

interface TreeCanvasProps {
  layout: LayoutResult
  options: LayoutOptions
  adjustments: Adjustments
  onAdjustNode: (path: string, adjustment: NodeAdjustment) => void
  onResetNode: (path: string) => void
  arrows: MovementArrow[]
  arrowAdjustments: ArrowAdjustments
  onAdjustArrow: (id: string, adjustment: NodeAdjustment) => void
  onResetArrow: (id: string) => void
  /** Independent horizontal/vertical stretch factors (1 = 100%, unchanged). */
  scaleX?: number
  scaleY?: number
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
  scaleX,
  scaleY,
}: {
  n: LayoutNode
  opts: LayoutOptions
  adjustments: Adjustments
  onAdjustNode: (path: string, adjustment: NodeAdjustment) => void
  onResetNode: (path: string) => void
  scaleX: number
  scaleY: number
}) {
  const pos = resolvePos(n, adjustments, scaleX, scaleY)
  const hasLabel = n.node.label.length > 0
  const g = nodeGeometry(pos.y, opts, hasLabel)
  const dragState = useRef<{ pointerId: number; startClientX: number; startClientY: number; startAdj: NodeAdjustment } | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<SVGGElement>) => {
    e.stopPropagation()
    const current = adjustments[n.node.path] ?? { dx: 0, dy: 0 }
    dragState.current = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startAdj: current }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  // Pointer movement happens in screen pixels, but adjustments are stored in the
  // canvas's own pre-scale coordinate space (the space `n.x`/`n.y` live in), so a
  // screen-pixel delta has to be divided back down by the aspect scale to land the
  // node back under the cursor.
  const handlePointerMove = (e: ReactPointerEvent<SVGGElement>) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = drag.startAdj.dx + (e.clientX - drag.startClientX) / scaleX
    const dy = drag.startAdj.dy + (e.clientY - drag.startClientY) / scaleY
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
  scaleX,
  scaleY,
}: {
  n: LayoutNode
  opts: LayoutOptions
  adjustments: Adjustments
  onAdjustNode: (path: string, adjustment: NodeAdjustment) => void
  onResetNode: (path: string) => void
  scaleX: number
  scaleY: number
}) {
  const pos = resolvePos(n, adjustments, scaleX, scaleY)
  const g = nodeGeometry(pos.y, opts, n.node.label.length > 0)

  return (
    <g>
      {n.children.map((child) => {
        const childPos = resolvePos(child, adjustments, scaleX, scaleY)
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

      <DraggableNode
        n={n}
        opts={opts}
        adjustments={adjustments}
        onAdjustNode={onAdjustNode}
        onResetNode={onResetNode}
        scaleX={scaleX}
        scaleY={scaleY}
      />

      {n.children.map((child) => (
        <TreeNodeSvg
          key={child.node.path}
          n={child}
          opts={opts}
          adjustments={adjustments}
          onAdjustNode={onAdjustNode}
          onResetNode={onResetNode}
          scaleX={scaleX}
          scaleY={scaleY}
        />
      ))}
    </g>
  )
}

function ArrowPath({
  arrow,
  layout,
  options,
  adjustments,
  arrowAdjustments,
  onAdjustArrow,
  onResetArrow,
  scaleX,
  scaleY,
}: {
  arrow: MovementArrow
  layout: LayoutResult
  options: LayoutOptions
  adjustments: Adjustments
  arrowAdjustments: ArrowAdjustments
  onAdjustArrow: (id: string, adjustment: NodeAdjustment) => void
  onResetArrow: (id: string) => void
  scaleX: number
  scaleY: number
}) {
  const from = arrowAnchor(arrow.fromPath, layout, adjustments, options, scaleX, scaleY)
  const to = arrowAnchor(arrow.toPath, layout, adjustments, options, scaleX, scaleY)
  const control = resolveArrowControlPoint(arrow.id, from, to, arrowAdjustments)
  const dragState = useRef<{ pointerId: number; startClientX: number; startClientY: number; startAdj: NodeAdjustment } | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.stopPropagation()
    const current = arrowAdjustments[arrow.id] ?? { dx: 0, dy: 0 }
    dragState.current = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startAdj: current }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent<SVGCircleElement>) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = drag.startAdj.dx + (e.clientX - drag.startClientX) / scaleX
    const dy = drag.startAdj.dy + (e.clientY - drag.startClientY) / scaleY
    onAdjustArrow(arrow.id, { dx, dy })
  }

  const handlePointerUp = (e: ReactPointerEvent<SVGCircleElement>) => {
    if (dragState.current?.pointerId === e.pointerId) dragState.current = null
  }

  return (
    <g>
      <path
        d={`M ${from.x},${from.y} Q ${control.x},${control.y} ${to.x},${to.y}`}
        fill="none"
        stroke="black"
        strokeWidth={1.25}
        markerEnd="url(#dendrograph-arrowhead)"
      />
      <circle
        cx={control.x}
        cy={control.y}
        r={5}
        fill="white"
        stroke="#888"
        strokeWidth={1}
        style={{ cursor: 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onResetArrow(arrow.id)
        }}
      />
    </g>
  )
}

function ArrowsLayer({
  arrows,
  layout,
  options,
  adjustments,
  arrowAdjustments,
  onAdjustArrow,
  onResetArrow,
  scaleX,
  scaleY,
}: {
  arrows: MovementArrow[]
  layout: LayoutResult
  options: LayoutOptions
  adjustments: Adjustments
  arrowAdjustments: ArrowAdjustments
  onAdjustArrow: (id: string, adjustment: NodeAdjustment) => void
  onResetArrow: (id: string) => void
  scaleX: number
  scaleY: number
}) {
  if (arrows.length === 0) return null
  return (
    <g>
      <defs>
        <marker
          id="dendrograph-arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="black" />
        </marker>
      </defs>
      {arrows.map((arrow) => (
        <ArrowPath
          key={arrow.id}
          arrow={arrow}
          layout={layout}
          options={options}
          adjustments={adjustments}
          arrowAdjustments={arrowAdjustments}
          onAdjustArrow={onAdjustArrow}
          onResetArrow={onResetArrow}
          scaleX={scaleX}
          scaleY={scaleY}
        />
      ))}
    </g>
  )
}

/** Movement-arrow curves can bulge below the tree's own bounding box (their control
 *  point, and by the convex-hull property of Bezier curves the whole curve, never
 *  exceeds the max y of {from, control, to}), so the canvas needs to reserve that
 *  much extra height or the curve gets clipped. */
export function arrowsMaxY(
  arrows: MovementArrow[],
  layout: LayoutResult,
  options: LayoutOptions,
  adjustments: Adjustments,
  arrowAdjustments: ArrowAdjustments,
  scaleX = 1,
  scaleY = 1,
): number {
  let maxY = 0
  for (const arrow of arrows) {
    const from = arrowAnchor(arrow.fromPath, layout, adjustments, options, scaleX, scaleY)
    const to = arrowAnchor(arrow.toPath, layout, adjustments, options, scaleX, scaleY)
    const control = resolveArrowControlPoint(arrow.id, from, to, arrowAdjustments)
    maxY = Math.max(maxY, from.y, to.y, control.y)
  }
  return maxY
}

/** The canvas's total rendered size (including padding and the aspect-ratio scale),
 *  shared with callers that need to size a container around the `<svg>` (e.g. the
 *  zoom/pan viewport) without duplicating this math. */
export function canvasSize(
  layout: LayoutResult,
  arrows: MovementArrow[],
  options: LayoutOptions,
  adjustments: Adjustments,
  arrowAdjustments: ArrowAdjustments,
  scaleX: number,
  scaleY: number,
  padding = 24,
): { width: number; height: number } {
  const height = Math.max(layout.height * scaleY, arrowsMaxY(arrows, layout, options, adjustments, arrowAdjustments, scaleX, scaleY))
  return { width: layout.width * scaleX + padding * 2, height: height + padding * 2 }
}

export const TreeCanvas = forwardRef<SVGSVGElement, TreeCanvasProps>(function TreeCanvas(
  {
    layout,
    options,
    adjustments,
    onAdjustNode,
    onResetNode,
    arrows,
    arrowAdjustments,
    onAdjustArrow,
    onResetArrow,
    scaleX = 1,
    scaleY = 1,
    padding = 24,
  },
  ref,
) {
  const { width, height } = canvasSize(layout, arrows, options, adjustments, arrowAdjustments, scaleX, scaleY, padding)

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
          scaleX={scaleX}
          scaleY={scaleY}
        />
        <ArrowsLayer
          arrows={arrows}
          layout={layout}
          options={options}
          adjustments={adjustments}
          arrowAdjustments={arrowAdjustments}
          onAdjustArrow={onAdjustArrow}
          onResetArrow={onResetArrow}
          scaleX={scaleX}
          scaleY={scaleY}
        />
      </g>
    </svg>
  )
})
