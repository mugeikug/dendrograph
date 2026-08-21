import type { LabelSegment, TreeNode } from './treeModel'

export class ParseError extends Error {
  readonly position: number

  constructor(message: string, position: number) {
    super(message)
    this.name = 'ParseError'
    this.position = position
  }
}

const BRACKET_OR_WS = /[\s[\]]/

/** Inline sub/superscript syntax: `_{...}` / `^{...}`, or `_x` / `^x` for a single token.
 *  Applied only to the plain-text portions of a label -- math segments (`$...$`) are
 *  extracted separately, upstream, in `parseLabelSegments`. */
function parseInlineText(raw: string): LabelSegment[] {
  const segments: LabelSegment[] = []
  const re = /([_^])(\{[^}]*\}|\S+)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    if (m.index > last) segments.push({ text: raw.slice(last, m.index), script: 'normal' })
    const marker = m[1]
    let content = m[2]
    if (content.startsWith('{') && content.endsWith('}')) {
      content = content.slice(1, -1)
    }
    if (content.length > 0) {
      segments.push({ text: content, script: marker === '_' ? 'sub' : 'sup' })
    }
    last = re.lastIndex
  }
  if (last < raw.length) segments.push({ text: raw.slice(last), script: 'normal' })
  return segments
}

/** Splits `raw` into plain-text chunks and `$...$` (inline) / `$$...$$` (display) math
 *  chunks, scanning left to right and escape-aware (`\$` is a literal "$", never a
 *  delimiter -- unescaped to "$" in the plain-text result). Each plain-text chunk is
 *  then run through the existing `_{}/^{}` scanner; each math chunk becomes a single
 *  `script: 'math'` segment holding the raw (unmodified) TeX source between the
 *  delimiters. An unterminated `$`/`$$` is treated as literal plain text rather than
 *  erroring, so a stray dollar sign doesn't break parsing. */
function parseLabelSegments(raw: string): LabelSegment[] {
  const segments: LabelSegment[] = []
  let plainStart = 0
  let i = 0

  const flushPlain = (end: number) => {
    if (end <= plainStart) return
    const chunk = raw.slice(plainStart, end).replace(/\\\$/g, '$')
    segments.push(...parseInlineText(chunk))
  }

  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '$') {
      const display = raw[i + 1] === '$'
      const delim = display ? '$$' : '$'
      const contentStart = i + delim.length
      let j = contentStart
      let closeAt = -1
      while (j < raw.length) {
        if (raw[j] === '\\') {
          j += 2
          continue
        }
        if (raw.startsWith(delim, j)) {
          closeAt = j
          break
        }
        j++
      }
      if (closeAt === -1) {
        // Unterminated -- treat the "$" as literal and keep scanning from just past it.
        i++
        continue
      }
      flushPlain(i)
      segments.push({ text: raw.slice(contentStart, closeAt), script: 'math', display })
      i = closeAt + delim.length
      plainStart = i
      continue
    }
    i++
  }
  flushPlain(raw.length)
  return segments
}

interface ParserState {
  input: string
  pos: number
}

function skipWs(s: ParserState) {
  while (s.pos < s.input.length && /\s/.test(s.input[s.pos])) s.pos++
}

/** Reads one label/word token. A "{...}" group -- wherever it appears in the token,
 *  brace-depth aware -- is read atomically, so internal spaces don't end the token
 *  early (e.g. `t~{agentive subject}` stays one token). A "$...$"/"$$...$$" math span is
 *  likewise read atomically and *without* regard to its own internal whitespace/braces/
 *  brackets (real TeX routinely has spaces and "[", "]" at top level, e.g.
 *  `\begin{bmatrix} \text{CASE} & \text{nom} \\ ... \end{bmatrix}`), so the token isn't
 *  cut short partway through a formula. Returns the raw text with braces/delimiters
 *  intact; unwrapping and math-segment extraction happen later. */
function readToken(s: ParserState): string {
  const start = s.pos
  while (s.pos < s.input.length) {
    const ch = s.input[s.pos]
    if (ch === '\\') {
      // An escaped character (e.g. "\$", "\~") is never a delimiter -- consume it and
      // whatever it escapes as one atomic unit, before any of the checks below apply.
      s.pos += 2
      continue
    }
    if (ch === '{') {
      const braceStart = s.pos
      s.pos++
      let depth = 1
      while (s.pos < s.input.length && depth > 0) {
        if (s.input[s.pos] === '{') depth++
        else if (s.input[s.pos] === '}') depth--
        s.pos++
      }
      if (depth > 0) {
        throw new ParseError('"{" に対応する "}" がありません', braceStart)
      }
      continue
    }
    if (ch === '$') {
      const dollarStart = s.pos
      const delim = s.input[s.pos + 1] === '$' ? '$$' : '$'
      s.pos += delim.length
      let closed = false
      while (s.pos < s.input.length) {
        if (s.input[s.pos] === '\\') {
          s.pos += 2
          continue
        }
        if (s.input.startsWith(delim, s.pos)) {
          s.pos += delim.length
          closed = true
          break
        }
        s.pos++
      }
      if (!closed) {
        // Unterminated -- back off to just past this one "$" and keep reading normally
        // (matching `parseLabelSegments`'s fallback: a stray "$" is literal text, not
        // an error), so the token still ends correctly at the next whitespace/bracket.
        s.pos = dollarStart + 1
      }
      continue
    }
    if (BRACKET_OR_WS.test(ch)) break
    s.pos++
  }
  return s.input.slice(start, s.pos)
}

/** Unwraps `raw` if it is exactly one balanced "{...}" group (not e.g. "{a}{b}",
 *  where the first group closes before the string ends). */
function unwrapOuterBraces(raw: string): string {
  if (raw.length < 2 || raw[0] !== '{' || raw[raw.length - 1] !== '}') return raw
  let depth = 0
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    else if (raw[i] === '}') {
      depth--
      if (depth === 0) return i === raw.length - 1 ? raw.slice(1, -1) : raw
    }
  }
  return raw
}

/** Finds the first top-level (brace-depth 0), unescaped "~" in `raw` and splits it
 *  into the label text before it and the arrow-tag content after (unwrapping the
 *  tag's own "{...}" if present, e.g. `t~{agentive subject}`). `\~` is a literal
 *  "~", not a marker -- skipped while scanning, then unescaped in the result. */
function extractArrowTag(raw: string): { rest: string; arrowTag?: string } {
  let depth = 0
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\\') {
      i++ // the escaped character is never treated as a marker
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '~' && depth === 0) {
      const rest = raw.slice(0, i).replace(/\\~/g, '~')
      const arrowTag = unwrapOuterBraces(raw.slice(i + 1))
      return { rest, arrowTag }
    }
  }
  return { rest: raw.replace(/\\~/g, '~') }
}

const TRIANGLE_MARKERS = ['△', '▲']

/** Strips an arrow tag (`~tag` / `~{tag with spaces}`), then -- only where triangle
 *  markers are meaningful, i.e. not for bare leaf words -- a trailing triangle
 *  marker, then unwraps outer "{...}" braces from what's left. */
function parseLabelToken(
  raw: string,
  allowTriangle: boolean,
): { rest: string; isTriangle: boolean; arrowTag?: string } {
  const { rest: afterTag, arrowTag } = extractArrowTag(raw)
  let rest = afterTag
  let isTriangle = false
  if (allowTriangle) {
    for (const marker of TRIANGLE_MARKERS) {
      if (rest.endsWith(marker)) {
        isTriangle = true
        rest = rest.slice(0, -marker.length)
        break
      }
    }
    if (!isTriangle && rest.endsWith('!') && rest.length > 1) {
      isTriangle = true
      rest = rest.slice(0, -1)
    }
  }
  rest = unwrapOuterBraces(rest)
  return { rest, isTriangle, arrowTag }
}

function parseNode(s: ParserState, path: string): TreeNode {
  if (s.input[s.pos] !== '[') {
    throw new ParseError(`"[" が必要です`, s.pos)
  }
  s.pos++

  // A label is optional. Whitespace directly after "[" is the signal that it's been
  // omitted -- "[ a_{1} dog]" has no label, with "a_{1}" and "dog" as its children,
  // whereas "[a_{1} dog]" (no leading space) treats "a_{1}" itself as the label.
  // "[[NP the] [VP runs]]" (a bracket immediately after "[") is unlabeled either way.
  const hasLeadingSpace = /\s/.test(s.input[s.pos] ?? '')
  skipWs(s)

  const rawLabel = hasLeadingSpace ? '' : readToken(s)
  const { rest: labelText, isTriangle, arrowTag } = parseLabelToken(rawLabel, true)
  const label = parseLabelSegments(labelText)
  skipWs(s)

  if (isTriangle) {
    let depth = 1
    const yieldStart = s.pos
    while (s.pos < s.input.length && depth > 0) {
      const ch = s.input[s.pos]
      if (ch === '[') depth++
      else if (ch === ']') {
        depth--
        if (depth === 0) break
      }
      s.pos++
    }
    if (s.input[s.pos] !== ']') {
      throw new ParseError('"]" が閉じられていません', s.pos)
    }
    const yieldRaw = s.input
      .slice(yieldStart, s.pos)
      .trim()
      .replace(/\s+/g, ' ')
    s.pos++ // consume ']'
    return {
      path,
      label,
      children: [],
      isTriangle: true,
      triangleYield: yieldRaw.length > 0 ? parseLabelSegments(yieldRaw) : undefined,
      arrowTag,
    }
  }

  const children: TreeNode[] = []
  for (;;) {
    skipWs(s)
    if (s.pos >= s.input.length) {
      throw new ParseError('"]" が閉じられていません', s.pos)
    }
    if (s.input[s.pos] === ']') {
      s.pos++
      break
    }
    if (s.input[s.pos] === '[') {
      children.push(parseNode(s, `${path}-${children.length}`))
    } else {
      const wordStart = s.pos
      const word = readToken(s)
      if (word.length === 0) {
        throw new ParseError(`予期しない文字です: "${s.input[s.pos]}"`, wordStart)
      }
      const { rest: wordText, arrowTag: wordArrowTag } = parseLabelToken(word, false)
      children.push({
        path: `${path}-${children.length}`,
        label: parseLabelSegments(wordText),
        children: [],
        isTriangle: false,
        arrowTag: wordArrowTag,
      })
    }
  }

  return { path, label, children, isTriangle: false, arrowTag }
}

export function parseTree(input: string): TreeNode {
  const s: ParserState = { input, pos: 0 }
  skipWs(s)
  if (s.pos >= s.input.length) {
    throw new ParseError('入力が空です', s.pos)
  }
  const node = parseNode(s, '0')
  skipWs(s)
  if (s.pos < s.input.length) {
    throw new ParseError(`余分な文字があります: "${s.input.slice(s.pos, s.pos + 20)}"`, s.pos)
  }
  return node
}
