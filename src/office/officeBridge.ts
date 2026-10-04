import { buildDialogUrl, readDialogSize, type EditorState } from './dialogState'

export { isDialogWindow, readInitialStateFromUrl, type EditorState } from './dialogState'

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

function parseMessage(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// displayDialogAsync only accepts height/width as a percentage of the current display, not
// pixels, so a remembered pixel size (saved by the dialog page itself via dialogState.ts's
// saveDialogSize) has to be converted on the way back in. This is necessarily approximate
// (percentage rounding, and the dialog may reopen on a different monitor/DPI than it was
// resized on), but gets close enough to feel like "it remembered."
function clampPercent(value: number): number {
  return Math.min(100, Math.max(20, Math.round(value)))
}

function dialogSizeOptions(): { height: number; width: number } {
  const saved = readDialogSize()
  if (!saved || !window.screen.width || !window.screen.height) return { height: 70, width: 60 }
  return {
    width: clampPercent((saved.width / window.screen.width) * 100),
    height: clampPercent((saved.height / window.screen.height) * 100),
  }
}

/** Called from the task pane: opens the popout editor with the current state encoded
 *  directly in the dialog's URL. This avoids a parent<->dialog "ready/init" handshake
 *  (and its message-timing edge cases) entirely for the initial state; only the final
 *  "apply" result needs to travel back via postMessage. */
export function openEditorDialog(state: EditorState, onApply: (state: EditorState) => void): void {
  if (!window.Office) return
  const url = buildDialogUrl(state)

  // A normal-sized window, not a maximized one -- the user can resize it themselves
  // if they want more room (it's a real, independently resizable OS window). Reopens at
  // whatever size it was last resized to, approximated from pixels to a screen percentage.
  const { height, width } = dialogSizeOptions()
  window.Office.context.ui.displayDialogAsync(url, { height, width, promptBeforeOpen: false }, (asyncResult) => {
    if (asyncResult.status === window.Office!.AsyncResultStatus.Failed) {
      console.error('ダイアログを開けませんでした', asyncResult.error)
      return
    }
    const dialog = asyncResult.value
    dialog.addEventHandler(window.Office!.EventType.DialogMessageReceived, (args) => {
      if (!('message' in args)) return
      const message = parseMessage(args.message)
      if (message?.type === 'apply') {
        onApply({
          input: message.input as string,
          adjustments: message.adjustments as EditorState['adjustments'],
          arrowAdjustments: (message.arrowAdjustments as EditorState['arrowAdjustments']) ?? {},
          aspectScale: (message.aspectScale as EditorState['aspectScale']) ?? { x: 1, y: 1 },
          branchWidthPt: (message.branchWidthPt as EditorState['branchWidthPt']) ?? 1,
        })
        dialog.close()
      }
    })
  })
}

/** Called from inside the dialog window when the user is done editing. */
export function applyAndCloseDialog(state: EditorState): void {
  window.Office?.context.ui.messageParent(JSON.stringify({ type: 'apply', ...state }))
}
