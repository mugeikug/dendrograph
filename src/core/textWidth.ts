/** Pluggable text-width measurement so the layout engine stays testable outside a browser. */
export type MeasureText = (text: string, fontSize: number) => number

/** Cheap character-count-based estimate; used as the default and in Node-based tests. */
export const approximateMeasureText: MeasureText = (text, fontSize) => {
  // Rough average glyph width for a proportional serif/sans font, tuned for
  // a mix of Latin letters and Japanese characters (CJK glyphs are ~1em wide).
  let width = 0
  for (const ch of text) {
    width += /[　-鿿＀-￯]/.test(ch) ? fontSize : fontSize * 0.56
  }
  return width
}

let canvasCtx: CanvasRenderingContext2D | null | undefined
function getCanvasContext(): CanvasRenderingContext2D | null {
  if (canvasCtx !== undefined) return canvasCtx
  if (typeof document === 'undefined') {
    canvasCtx = null
    return canvasCtx
  }
  const canvas = document.createElement('canvas')
  canvasCtx = canvas.getContext('2d')
  return canvasCtx
}

/** Real glyph-metric measurement via an offscreen canvas; falls back to the estimate
 *  when no DOM is available (e.g. server-side / test environments). */
export const canvasMeasureText: MeasureText = (text, fontSize) => {
  const ctx = getCanvasContext()
  if (!ctx) return approximateMeasureText(text, fontSize)
  ctx.font = `${fontSize}px "Times New Roman", "Yu Mincho", serif`
  return ctx.measureText(text).width
}
