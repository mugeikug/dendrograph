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
} from '../render/geometry'

const EMU_PER_PX = 9525 // 914400 EMU/inch ÷ 96 px/inch (CSS px)

export interface OoxmlExportOptions {
  padding?: number
  groupName?: string
  /** Independent horizontal/vertical stretch factors (1 = 100%, unchanged), applied to
   *  node/arrow positions only -- text box and triangle sizes stay at their normal,
   *  undistorted size, only moving to follow their (stretched) node. */
  scaleX?: number
  scaleY?: number
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function runsFromSegments(segments: LabelSegment[], fontSizePx: number): string {
  const baseHalfPt = Math.round(fontSizePx * 0.75 * 2)
  const smallHalfPt = Math.round(baseHalfPt * 0.68)
  return segments
    .map((seg) => {
      const rPr =
        seg.script === 'normal'
          ? `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="${baseHalfPt}"/></w:rPr>`
          : `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="${smallHalfPt}"/><w:vertAlign w:val="${seg.script === 'sub' ? 'subscript' : 'superscript'}"/></w:rPr>`
      return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(seg.text)}</w:t></w:r>`
    })
    .join('')
}

function textBoxShape(id: number, name: string, segments: LabelSegment[], xEmu: number, yEmu: number, wEmu: number, hEmu: number, opts: LayoutOptions): string {
  return `<wps:wsp>
  <wps:cNvPr id="${id}" name="${escapeXml(name)}${id}"/>
  <wps:cNvSpPr txBox="1"/>
  <wps:spPr>
    <a:xfrm><a:off x="${xEmu}" y="${yEmu}"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:noFill/>
    <a:ln><a:noFill/></a:ln>
  </wps:spPr>
  <wps:txbx>
    <w:txbxContent>
      <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${runsFromSegments(segments, opts.fontSize)}</w:p>
    </w:txbxContent>
  </wps:txbx>
  <wps:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t">
    <a:noAutofit/>
  </wps:bodyPr>
</wps:wsp>`
}

function lineShape(id: number, name: string, x1: number, y1: number, x2: number, y2: number): string {
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const w = Math.abs(x2 - x1) || 1
  const h = Math.abs(y2 - y1) || 1
  const flip = `${x2 < x1 ? ' flipH="1"' : ''}${y2 < y1 ? ' flipV="1"' : ''}`
  return `<wps:wsp>
  <wps:cNvPr id="${id}" name="${escapeXml(name)}${id}"/>
  <wps:cNvCnPr><a:cxnSpLocks noChangeShapeType="1"/></wps:cNvCnPr>
  <wps:spPr>
    <a:xfrm${flip}><a:off x="${left}" y="${top}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
    <a:prstGeom prst="line"><a:avLst/></a:prstGeom>
    <a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
  </wps:spPr>
  <wps:bodyPr/>
</wps:wsp>`
}

function triangleShape(id: number, name: string, xEmu: number, yEmu: number, wEmu: number, hEmu: number): string {
  return `<wps:wsp>
  <wps:cNvPr id="${id}" name="${escapeXml(name)}${id}"/>
  <wps:cNvSpPr/>
  <wps:spPr>
    <a:xfrm><a:off x="${xEmu}" y="${yEmu}"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm>
    <a:prstGeom prst="triangle"><a:avLst/></a:prstGeom>
    <a:noFill/>
    <a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
  </wps:spPr>
  <wps:bodyPr/>
</wps:wsp>`
}

/** A curved movement-arrow: a quadratic-bezier `custGeom` path with a triangular
 *  arrowhead on the end pointing at the antecedent. `from`/`control`/`to` are all in
 *  EMU, already in the group's shared coordinate space (see `emu()` in
 *  `layoutToOoxml`). The path's local `w`/`h` are set equal to the shape's own EMU
 *  extent, so path coordinates can be used as EMU directly (verified against the
 *  ECMA-376 Part 3 Primer: this makes the path's local coordinate system 1:1 with
 *  the shape's own, no extra scaling needed). */
function arrowShape(
  id: number,
  name: string,
  from: { x: number; y: number },
  control: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const minX = Math.min(from.x, control.x, to.x)
  const minY = Math.min(from.y, control.y, to.y)
  const w = Math.max(1, Math.max(from.x, control.x, to.x) - minX)
  const h = Math.max(1, Math.max(from.y, control.y, to.y) - minY)
  const local = (p: { x: number; y: number }) => ({ x: Math.round(p.x - minX), y: Math.round(p.y - minY) })
  const lFrom = local(from)
  const lControl = local(control)
  const lTo = local(to)
  return `<wps:wsp>
  <wps:cNvPr id="${id}" name="${escapeXml(name)}${id}"/>
  <wps:cNvSpPr/>
  <wps:spPr>
    <a:xfrm><a:off x="${Math.round(minX)}" y="${Math.round(minY)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm>
    <a:custGeom>
      <a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>
      <a:rect l="0" t="0" r="0" b="0"/>
      <a:pathLst>
        <a:path w="${Math.round(w)}" h="${Math.round(h)}">
          <a:moveTo><a:pt x="${lFrom.x}" y="${lFrom.y}"/></a:moveTo>
          <a:quadBezTo>
            <a:pt x="${lControl.x}" y="${lControl.y}"/>
            <a:pt x="${lTo.x}" y="${lTo.y}"/>
          </a:quadBezTo>
        </a:path>
      </a:pathLst>
    </a:custGeom>
    <a:noFill/>
    <a:ln w="9525">
      <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
      <a:headEnd type="none"/>
      <a:tailEnd type="triangle" w="med" len="med"/>
    </a:ln>
  </wps:spPr>
  <wps:bodyPr/>
</wps:wsp>`
}

function wrapPackage(groupName: string, widthEmu: number, heightEmu: number, shapesXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">
  <pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml" pkg:padding="512">
    <pkg:xmlData>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>
    </pkg:xmlData>
  </pkg:part>
  <pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml">
    <pkg:xmlData>
      <w:document
        mc:Ignorable="w14 wp14"
        xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
        xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
        xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <w:body>
          <w:p>
            <w:r>
              <w:drawing>
                <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
                  <wp:simplePos x="0" y="0"/>
                  <wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>
                  <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
                  <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
                  <wp:effectExtent l="0" t="0" r="0" b="0"/>
                  <wp:wrapNone/>
                  <wp:docPr id="1" name="${escapeXml(groupName)}"/>
                  <wp:cNvGraphicFramePr/>
                  <a:graphic>
                    <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">
                      <wpg:wgp>
                        <wpg:cNvGrpSpPr/>
                        <wpg:grpSpPr>
                          <a:xfrm>
                            <a:off x="0" y="0"/>
                            <a:ext cx="${widthEmu}" cy="${heightEmu}"/>
                            <a:chOff x="0" y="0"/>
                            <a:chExt cx="${widthEmu}" cy="${heightEmu}"/>
                          </a:xfrm>
                        </wpg:grpSpPr>
                        ${shapesXml}
                      </wpg:wgp>
                    </a:graphicData>
                  </a:graphic>
                </wp:anchor>
              </w:drawing>
            </w:r>
          </w:p>
        </w:body>
      </w:document>
    </pkg:xmlData>
  </pkg:part>
</pkg:package>`
}

export function layoutToOoxml(
  layout: LayoutResult,
  layoutOptions: LayoutOptions,
  adjustments: Adjustments,
  arrows: MovementArrow[] = [],
  arrowAdjustments: ArrowAdjustments = {},
  exportOptions: OoxmlExportOptions = {},
): string {
  const padding = exportOptions.padding ?? 24
  const groupName = exportOptions.groupName ?? 'Dendrograph'
  // Baked into every node/arrow position below (not a blanket group transform), so
  // branches and arrows stretch with the aspect-ratio control while text and shapes
  // keep their normal, undistorted size -- matching the SVG preview's approach.
  const scaleX = exportOptions.scaleX ?? 1
  const scaleY = exportOptions.scaleY ?? 1

  const px = (v: number) => v + padding
  const emu = (v: number) => Math.round(px(v) * EMU_PER_PX) // absolute position (includes padding offset)
  const emuSize = (v: number) => Math.round(v * EMU_PER_PX) // width/height (no padding offset)
  const emuPoint = (p: { x: number; y: number }) => ({ x: emu(p.x), y: emu(p.y) })

  const shapes: string[] = []
  let nextId = 2 // id 1 is reserved for the outer wp:docPr

  function walk(n: LayoutNode) {
    const pos = resolvePos(n, adjustments, scaleX, scaleY)
    const hasLabel = n.node.label.length > 0
    const g = nodeGeometry(pos.y, layoutOptions, hasLabel)

    // Word's own line-height for the label text box renders taller than the SVG
    // preview's baseline-only model, so the edge needs a bit more clearance here
    // than `labelGap` alone provides to avoid visually touching the label text.
    // An unlabeled node has no label to clear -- its edges meet exactly at childEdgeY.
    const edgeStartY = hasLabel ? g.childEdgeY + layoutOptions.fontSize * 0.3 : g.childEdgeY

    for (const child of n.children) {
      const childPos = resolvePos(child, adjustments, scaleX, scaleY)
      const childTopY = nodeGeometry(childPos.y, layoutOptions).topY
      shapes.push(lineShape(nextId++, 'Edge', emu(pos.x), emu(edgeStartY), emu(childPos.x), emu(childTopY)))
    }

    if (hasLabel) {
      shapes.push(
        textBoxShape(
          nextId++,
          'Label',
          n.node.label,
          emu(pos.x - n.width / 2),
          emu(g.topY),
          emuSize(n.width),
          emuSize(layoutOptions.fontSize * 1.5),
          layoutOptions,
        ),
      )
    }

    if (n.node.isTriangle) {
      shapes.push(
        triangleShape(
          nextId++,
          'Triangle',
          emu(pos.x - n.width / 2),
          emu(g.triangleApexY),
          emuSize(n.width),
          emuSize(g.triangleBaseY - g.triangleApexY),
        ),
      )
      if (n.node.triangleYield) {
        shapes.push(
          textBoxShape(
            nextId++,
            'Yield',
            n.node.triangleYield,
            emu(pos.x - n.width / 2),
            emu(g.triangleBaseY),
            emuSize(n.width),
            emuSize(layoutOptions.fontSize * 1.5),
            layoutOptions,
          ),
        )
      }
    }

    for (const child of n.children) walk(child)
  }

  walk(layout.root)

  for (const arrow of arrows) {
    const from = arrowAnchor(arrow.fromPath, layout, adjustments, layoutOptions, scaleX, scaleY)
    const to = arrowAnchor(arrow.toPath, layout, adjustments, layoutOptions, scaleX, scaleY)
    const control = resolveArrowControlPoint(arrow.id, from, to, arrowAdjustments)
    shapes.push(arrowShape(nextId++, 'Arrow', emuPoint(from), emuPoint(control), emuPoint(to)))
  }

  const contentHeight = Math.max(
    layout.height * scaleY,
    ...arrows.flatMap((arrow) => {
      const from = arrowAnchor(arrow.fromPath, layout, adjustments, layoutOptions, scaleX, scaleY)
      const to = arrowAnchor(arrow.toPath, layout, adjustments, layoutOptions, scaleX, scaleY)
      const control = resolveArrowControlPoint(arrow.id, from, to, arrowAdjustments)
      return [from.y, to.y, control.y]
    }),
  )

  const widthEmu = Math.round((layout.width * scaleX + padding * 2) * EMU_PER_PX)
  const heightEmu = Math.round((contentHeight + padding * 2) * EMU_PER_PX)

  return wrapPackage(groupName, widthEmu, heightEmu, shapes.join('\n'))
}
