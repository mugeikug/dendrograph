// Bridge for the legacy COM/VSTO Word add-in host. Unlike officeBridge.ts (which talks to
// Word via the Office.js runtime loaded from Microsoft's CDN), this host is a WebView2
// control embedded directly in a .NET custom task pane: the page is served from a local
// folder via SetVirtualHostNameToFolderMapping (no network dependency at all), and the only
// way to talk to the native host is WebView2's postMessage/addEventListener pair.
import type { EditorState } from './dialogState'

interface WebView2MessageEvent {
  data: unknown
}

interface WebView2 {
  postMessage(message: string): void
  addEventListener(type: 'message', listener: (event: WebView2MessageEvent) => void): void
}

declare global {
  interface Window {
    chrome?: { webview?: WebView2 }
    // Invoked via CoreWebView2.ExecuteScriptAsync by the task pane's host when the popout
    // editor window (a separate WebView2 instance) has applied its edits -- see
    // openEditorWindow() below for why a global hook is needed instead of a return value.
    __dendrographApplyFromPopout?: (json: string) => void
  }
}

const VIRTUAL_HOST = 'dendrograph.local'

/** True only when this page is being served by the VSTO add-in's WebView2 host via
 *  SetVirtualHostNameToFolderMapping -- synchronous, unlike officeBridge's detectWordHost,
 *  since there's no asynchronous runtime to wait for here. */
export function detectVstoHost(): boolean {
  return window.location.hostname === VIRTUAL_HOST
}

function webview(): WebView2 | null {
  return window.chrome?.webview ?? null
}

// Unlike Office.js's context.sync() promise, WebView2's postMessage is fire-and-forget, so
// every request/response pair here is correlated via a requestId the .NET host echoes back.
let nextRequestId = 1
const pendingRequests = new Map<number, { resolve: (reply: Record<string, unknown>) => void; reject: (err: Error) => void }>()
let listenerAttached = false

function ensureListener(): void {
  if (listenerAttached) return
  const wv = webview()
  if (!wv) return
  wv.addEventListener('message', (event) => {
    const message = event.data as Record<string, unknown> | null
    if (!message || typeof message.requestId !== 'number') return
    const entry = pendingRequests.get(message.requestId)
    if (!entry) return
    pendingRequests.delete(message.requestId)
    entry.resolve(message)
  })
  listenerAttached = true
}

/** Sends a request to the .NET host and resolves with its reply once a message carrying a
 *  matching requestId comes back. Errors are only raised for requests that opt into an "ok"
 *  field the .NET side can set to false (insertOoxml); callers that don't care simply ignore
 *  it and read other fields off the reply instead. */
function sendRpc(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const wv = webview()
  if (!wv) return Promise.reject(new Error('VSTOホストに接続できません(VSTO版アドインのタスクペイン以外では使用できません)'))
  ensureListener()
  const requestId = nextRequestId++
  const result = new Promise<Record<string, unknown>>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
  })
  wv.postMessage(JSON.stringify({ ...payload, requestId }))
  return result
}

export async function insertOoxmlIntoWord(ooxml: string): Promise<void> {
  const reply = await sendRpc({ type: 'insertOoxml', ooxml })
  if (!reply.ok) throw new Error((reply.error as string | undefined) ?? '不明なエラー')
}

/** Called from the task pane: asks the .NET host to open a second native window with its
 *  own WebView2 instance (see TaskPaneHost.cs/PopoutEditorForm.cs), navigated to this same
 *  page with the dialog query flag + initial state. The two WebView2 instances can't talk to
 *  each other directly, so the applied result comes back indirectly: the popout posts it to
 *  its own host, which relays it into the task pane's WebView2 via ExecuteScriptAsync calling
 *  the global hook registered here. */
export function openEditorWindow(state: EditorState, onApply: (state: EditorState) => void): void {
  const wv = webview()
  if (!wv) return
  window.__dendrographApplyFromPopout = (json: string) => {
    try {
      onApply(JSON.parse(json) as EditorState)
    } catch (e) {
      console.error('編集ウィンドウからの状態の反映に失敗しました', e)
    }
  }
  wv.postMessage(JSON.stringify({ type: 'openEditor', state }))
}

/** Called from inside the popout window when the user is done editing. */
export function applyAndCloseEditorWindow(state: EditorState): void {
  webview()?.postMessage(JSON.stringify({ type: 'editorApply', state }))
}

// --- Library file I/O ---
// The File System Access API (showOpenFilePicker/showSaveFilePicker) that libraryFile.ts
// otherwise uses is unverified inside an embedded, ClickOnce-deployed WebView2, and a native
// OpenFileDialog/SaveFileDialog is arguably the better experience anyway (no "the page wants
// to access your files" framing). So the VSTO edition routes library I/O through the host
// instead, keyed by file path rather than an opaque FileSystemFileHandle.

export interface VstoFileResult {
  path: string
  name: string
}

/** Opens a native file-picker dialog and reads the chosen .json file's contents.
 *  Returns null if the user cancels the dialog. */
export async function openLibraryFileVsto(): Promise<(VstoFileResult & { text: string }) | null> {
  const reply = await sendRpc({ type: 'openLibrary' })
  if (reply.canceled) return null
  if (!reply.ok) throw new Error((reply.error as string | undefined) ?? '読み込みに失敗しました')
  return { path: reply.path as string, name: reply.name as string, text: reply.text as string }
}

/** Opens a native save-as dialog and writes `text` to the chosen path.
 *  Returns null if the user cancels the dialog. */
export async function saveLibraryFileAsVsto(text: string, suggestedName: string): Promise<VstoFileResult | null> {
  const reply = await sendRpc({ type: 'saveLibraryAs', text, suggestedName })
  if (reply.canceled) return null
  if (!reply.ok) throw new Error((reply.error as string | undefined) ?? '保存に失敗しました')
  return { path: reply.path as string, name: reply.name as string }
}

/** Writes `text` directly to a previously chosen path, with no dialog. */
export async function saveLibraryFileToPathVsto(path: string, text: string): Promise<void> {
  const reply = await sendRpc({ type: 'saveLibraryToPath', path, text })
  if (!reply.ok) throw new Error((reply.error as string | undefined) ?? '保存に失敗しました')
}
