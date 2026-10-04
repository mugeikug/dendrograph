// Shared between officeBridge.ts (Office.js host) and vstoBridge.ts (VSTO/WebView2 host):
// the popout "big editor" window's initial state is always passed via a URL query param,
// regardless of which host opened it, so this half of the mechanism needs no host-specific code.

const DIALOG_QUERY_FLAG = 'dendrographDialog'

export interface EditorState {
  input: string
  adjustments: Record<string, { dx: number; dy: number }>
  arrowAdjustments: Record<string, { dx: number; dy: number }>
  aspectScale: { x: number; y: number }
  branchWidthPt: number
}

export function isDialogWindow(): boolean {
  return new URLSearchParams(window.location.search).get(DIALOG_QUERY_FLAG) === '1'
}

/** Builds the popout window's URL: the current page's own origin+path, with the
 *  dialog flag and the initial state encoded as query params. */
export function buildDialogUrl(state: EditorState): string {
  const encodedState = encodeURIComponent(JSON.stringify(state))
  return `${window.location.origin}${window.location.pathname}?${DIALOG_QUERY_FLAG}=1&state=${encodedState}`
}

/** Called from inside the popout window on mount: reads the state the opener
 *  encoded into the URL when it opened this window. */
export function readInitialStateFromUrl(): EditorState | null {
  const raw = new URLSearchParams(window.location.search).get('state')
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw)) as EditorState
  } catch {
    return null
  }
}

// --- Popout window size memory (Office.js edition only; the VSTO edition's popout is a
// native WinForms window and remembers its size via .NET user settings instead). ---

const DIALOG_SIZE_KEY = 'dendrograph-dialog-size'

export function saveDialogSize(width: number, height: number): void {
  try {
    localStorage.setItem(DIALOG_SIZE_KEY, JSON.stringify({ width, height }))
  } catch {
    // localStorage unavailable (e.g. private browsing) -- not worth remembering the size for.
  }
}

export function readDialogSize(): { width: number; height: number } | null {
  try {
    const raw = localStorage.getItem(DIALOG_SIZE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown }
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      return { width: parsed.width, height: parsed.height }
    }
    return null
  } catch {
    return null
  }
}
