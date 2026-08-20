const OFFICE_JS_URL = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js'

let officeLoadPromise: Promise<boolean> | null = null

function loadOfficeJs(): Promise<boolean> {
  if (officeLoadPromise) return officeLoadPromise
  officeLoadPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false)
      return
    }
    if (window.Office) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = OFFICE_JS_URL
    script.onload = () => resolve(!!window.Office)
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
  return officeLoadPromise
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(onTimeout), timeoutMs))])
}

/** True only when actually running inside Word's task pane; false in a plain browser
 *  tab (standalone use) or when office.js fails/times out loading (e.g. offline). */
export async function detectWordHost(timeoutMs = 2000): Promise<boolean> {
  const loaded = await withTimeout(loadOfficeJs(), timeoutMs, false)
  if (!loaded || !window.Office) return false
  const info = await withTimeout(
    new Promise<{ host: Office.HostType; platform: Office.PlatformType } | null>((resolve) =>
      window.Office!.onReady((i) => resolve(i)),
    ),
    timeoutMs,
    null,
  )
  return info?.host === window.Office.HostType.Word
}

export async function insertOoxmlIntoWord(ooxml: string): Promise<void> {
  if (!window.Word) throw new Error('Word JavaScript API が利用できません(Word上で実行されていません)')
  await window.Word.run(async (context) => {
    context.document.body.insertOoxml(ooxml, window.Word!.InsertLocation.end)
    await context.sync()
  })
}

// --- Popout editor dialog (task pane <-> Office Dialog messaging) ---
// The task pane is too narrow to comfortably edit a large tree, and Word task panes
// can't be resized without shrinking the document view. The Dialog API is Office's
// sanctioned way to open a larger, separate window from an Add-in.

const DIALOG_QUERY_FLAG = 'dendrographDialog'

export interface EditorState {
  input: string
  adjustments: Record<string, { dx: number; dy: number }>
}

export function isDialogWindow(): boolean {
  return new URLSearchParams(window.location.search).get(DIALOG_QUERY_FLAG) === '1'
}

function parseMessage(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Called from the task pane: opens the popout editor with the current state encoded
 *  directly in the dialog's URL. This avoids a parent<->dialog "ready/init" handshake
 *  (and its message-timing edge cases) entirely for the initial state; only the final
 *  "apply" result needs to travel back via postMessage. */
export function openEditorDialog(state: EditorState, onApply: (state: EditorState) => void): void {
  if (!window.Office) return
  const encodedState = encodeURIComponent(JSON.stringify(state))
  const url = `${window.location.origin}${window.location.pathname}?${DIALOG_QUERY_FLAG}=1&state=${encodedState}`

  // A normal-sized window, not a maximized one -- the user can resize it themselves
  // if they want more room (it's a real, independently resizable OS window).
  window.Office.context.ui.displayDialogAsync(url, { height: 70, width: 60, promptBeforeOpen: false }, (asyncResult) => {
    if (asyncResult.status === window.Office!.AsyncResultStatus.Failed) {
      console.error('ダイアログを開けませんでした', asyncResult.error)
      return
    }
    const dialog = asyncResult.value
    dialog.addEventHandler(window.Office!.EventType.DialogMessageReceived, (args) => {
      if (!('message' in args)) return
      const message = parseMessage(args.message)
      if (message?.type === 'apply') {
        onApply({ input: message.input as string, adjustments: message.adjustments as EditorState['adjustments'] })
        dialog.close()
      }
    })
  })
}

/** Called from inside the dialog window on mount: reads the state the task pane
 *  encoded into the URL when it opened this dialog. */
export function readInitialStateFromUrl(): EditorState | null {
  const raw = new URLSearchParams(window.location.search).get('state')
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw)) as EditorState
  } catch {
    return null
  }
}

/** Called from inside the dialog window when the user is done editing. */
export function applyAndCloseDialog(state: EditorState): void {
  window.Office?.context.ui.messageParent(JSON.stringify({ type: 'apply', ...state }))
}
