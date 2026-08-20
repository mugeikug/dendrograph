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

/** Inline sub/superscript syntax: `_{...}` / `^{...}`, or `_x` / `^x` for a single token. */
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

interface ParserState {
  input: string
  pos: number
}

function skipWs(s: ParserState) {
  while (s.pos < s.input.length && /\s/.test(s.input[s.pos])) s.pos++
}

/** Reads one label/word token. `{...}` groups everything up to the matching (brace
 *  depth aware) "}" into a single token, spaces and all -- e.g. `{the very old man}`. */
function readToken(s: ParserState): string {
  if (s.input[s.pos] === '{') {
    const braceStart = s.pos
    s.pos++
    const contentStart = s.pos
    let depth = 1
    while (s.pos < s.input.length && depth > 0) {
      if (s.input[s.pos] === '{') depth++
      else if (s.input[s.pos] === '}') depth--
      if (depth > 0) s.pos++
    }
    if (depth > 0) {
      throw new ParseError('"{" に対応する "}" がありません', braceStart)
    }
    const content = s.input.slice(contentStart, s.pos)
    s.pos++ // consume the matching '}'
    return content
  }
  const start = s.pos
  while (s.pos < s.input.length && !BRACKET_OR_WS.test(s.input[s.pos])) s.pos++
  return s.input.slice(start, s.pos)
}

const TRIANGLE_MARKERS = ['△', '▲']

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

  let labelRaw = ''
  let isTriangle = false
  if (!hasLeadingSpace) {
    labelRaw = readToken(s)
    for (const marker of TRIANGLE_MARKERS) {
      if (labelRaw.endsWith(marker)) {
        isTriangle = true
        labelRaw = labelRaw.slice(0, -marker.length)
        break
      }
    }
    if (!isTriangle && labelRaw.endsWith('!') && labelRaw.length > 1) {
      isTriangle = true
      labelRaw = labelRaw.slice(0, -1)
    }
  }

  const label = parseInlineText(labelRaw)
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
      triangleYield: yieldRaw.length > 0 ? parseInlineText(yieldRaw) : undefined,
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
      children.push({
        path: `${path}-${children.length}`,
        label: parseInlineText(word),
        children: [],
        isTriangle: false,
      })
    }
  }

  return { path, label, children, isTriangle: false }
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
