import { mathjax } from '@mathjax/src/mjs/mathjax.js'
import { TeX } from '@mathjax/src/mjs/input/tex.js'
import { SVG } from '@mathjax/src/mjs/output/svg.js'
import { liteAdaptor } from '@mathjax/src/mjs/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from '@mathjax/src/mjs/handlers/html.js'
import { SerializedMmlVisitor } from '@mathjax/src/mjs/core/MmlTree/SerializedMmlVisitor.js'
import '@mathjax/src/mjs/input/tex/base/BaseConfiguration.js'
import '@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js'
import { mml2omml } from 'mathml2omml'

// A single shared MathJax pipeline. `mathStyle: 'upright'` is what makes plain letters
// render non-italic -- the unmarked convention in linguistic notation, unlike normal
// TeX math mode. liteAdaptor is used everywhere (not just for the Node spike) since it
// needs no real DOM, so this module works identically in the browser and in tests.
const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const tex = new TeX({ packages: ['base', 'ams'], mathStyle: 'upright' })
const svgJax = new SVG({ fontCache: 'none' })
const svgDocument = mathjax.document('', { InputJax: tex, OutputJax: svgJax })
const mmlVisitor = new SerializedMmlVisitor()

export interface MathSvgResult {
  /** A standalone `<svg>...</svg>` string (viewBox present) ready to embed. */
  svg: string
  widthPx: number
  heightPx: number
  /** How far the glyph extends below its baseline, in px (0 if it doesn't dip below). */
  depthPx: number
}

function exToPx(value: string, pxPerEx: number): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n * pxPerEx : 0
}

const svgCache = new Map<string, MathSvgResult>()

/** Renders a TeX math source string to an embeddable SVG snippet, with plain-letter
 *  glyphs kept upright rather than italic. Results are memoized by (source, display,
 *  fontSize) so re-rendering the same label while typing elsewhere in the tree is free. */
export function renderMathToSvg(source: string, display: boolean, fontSize: number): MathSvgResult {
  const cacheKey = `${display ? 'D' : 'I'}|${fontSize}|${source}`
  const cached = svgCache.get(cacheKey)
  if (cached) return cached

  const pxPerEx = fontSize / 2
  const node = svgDocument.convert(source, { display, em: fontSize, ex: pxPerEx })
  const outerHtml = adaptor.outerHTML(node)

  const svgMatch = outerHtml.match(/<svg[\s\S]*<\/svg>/)
  const rawSvg = svgMatch ? svgMatch[0] : '<svg></svg>'
  const widthMatch = rawSvg.match(/width="([\d.]+)ex"/)
  const heightMatch = rawSvg.match(/height="([\d.]+)ex"/)
  const vAlignMatch = outerHtml.match(/vertical-align:\s*(-?[\d.]+)ex/)

  const widthPx = widthMatch ? exToPx(widthMatch[1], pxPerEx) : 0
  const heightPx = heightMatch ? exToPx(heightMatch[1], pxPerEx) : fontSize
  const depthPx = vAlignMatch ? Math.max(0, -exToPx(vAlignMatch[1], pxPerEx)) : 0

  // Rewrite the "ex"-unit width/height into plain px numbers (the viewBox, which is
  // what actually determines how the glyphs scale to fill that box, is left as-is), so
  // this string is directly embeddable at the right size without unit-conversion
  // surprises wherever it's dropped into another SVG document.
  const svg = rawSvg.replace(/width="[\d.]+ex"/, `width="${widthPx}"`).replace(/height="[\d.]+ex"/, `height="${heightPx}"`)

  const result: MathSvgResult = { svg, widthPx, heightPx, depthPx }
  svgCache.set(cacheKey, result)
  return result
}

const FENCES: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

/** `mathml2omml` has no support for MathML's stretchy-fence concept at all (mfenced
 *  throws, and `stretchy`/TeX-class attributes on <mo> are ignored) -- it just emits the
 *  fence characters as plain text runs, which don't grow to match enclosed content (e.g.
 *  a feature matrix in `[...]`). This rewrites a top-level "<m:r>[</m:r> ... <m:r>]</m:r>"
 *  wrapper into a proper OMML delimiter (`<m:d>`), which Word does auto-grow. Verified
 *  against real Word insertion (see Phase 6 spike notes in the project plan). Only the
 *  outermost fence pair is handled -- adequate for the "big bracket around a feature
 *  matrix" case this feature targets; nested fences elsewhere in the expression are left
 *  as plain characters. */
function fixTopLevelDelimiter(omath: string): string {
  const m = omath.match(
    /^(<m:oMath[^>]*>)(<m:r><m:t[^>]*>([([{])<\/m:t><\/m:r>)([\s\S]*)(<m:r><m:t[^>]*>([)\]}])<\/m:t><\/m:r>)(<\/m:oMath>)$/,
  )
  if (!m) return omath
  const [, open, , openChar, inner, , closeChar, close] = m
  if (FENCES[openChar] !== closeChar) return omath
  return `${open}<m:d><m:dPr><m:begChr m:val="${openChar}"/><m:endChr m:val="${closeChar}"/></m:dPr><m:e>${inner}</m:e></m:d>${close}`
}

/** Renders a TeX math source string to a native Word equation (OMML, `<m:oMath>`),
 *  suitable for embedding inside a `w:txbxContent` text box. */
export function renderMathToOmml(source: string, display: boolean): string {
  // `TeX.compile` only ever reads `.math`/`.display`/`.inputData` off its first
  // argument (verified against the actual implementation) despite its declared
  // `MathItem` parameter type demanding many more fields this call never needs.
  const mathItem = { math: source, display, inputData: {} } as unknown as Parameters<typeof tex.compile>[0]
  const mmlRoot = tex.compile(mathItem, svgDocument)
  const mmlString = mmlVisitor.visitTree(mmlRoot)
  return fixTopLevelDelimiter(mml2omml(mmlString))
}
