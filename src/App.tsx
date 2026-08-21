import { useEffect, useMemo, useRef, useState } from 'react'
import { ParseError, parseTree } from './core/parser'
import { defaultLayoutOptions, layoutTree } from './core/layout'
import { canvasMeasureText } from './core/textWidth'
import { createEntry, LibraryParseError, type TreeLibrary } from './core/library'
import { detectMovementArrows } from './core/movement'
import { TreeCanvas, canvasSize, type Adjustments, type ArrowAdjustments, type AspectScale, type NodeAdjustment } from './render/TreeCanvas'
import { ZoomPanViewport } from './render/ZoomPanViewport'
import { copyPngToClipboard, downloadPng, downloadSvg } from './export/imageExport'
import { layoutToOoxml } from './export/ooxml'
import { treeToForestCode } from './export/forest'
import { openLibraryFile, saveLibraryAsNewFile, type LibraryFileHandle } from './export/libraryFile'
import {
  applyAndCloseDialog,
  detectWordHost,
  insertOoxmlIntoWord,
  isDialogWindow,
  openEditorDialog,
  readInitialStateFromUrl,
} from './office/officeBridge'
import './App.css'

const SAMPLE = `[S [NP△ the very old man] [VP [V saw] [NP a_{1} dog^{*}]]]`

const isDialog = isDialogWindow()

function makeInitialState(): { library: TreeLibrary; activeId: string } {
  if (isDialog) {
    const initial = readInitialStateFromUrl()
    const entry = createEntry('編集中', initial?.input ?? SAMPLE)
    entry.adjustments = initial?.adjustments ?? {}
    entry.arrowAdjustments = initial?.arrowAdjustments ?? {}
    entry.aspectScale = initial?.aspectScale ?? { x: 1, y: 1 }
    return { library: { version: 1, entries: [entry] }, activeId: entry.id }
  }
  const entry = createEntry('サンプル', SAMPLE)
  return { library: { version: 1, entries: [entry] }, activeId: entry.id }
}

function App() {
  const [{ library, activeId }, setState] = useState(makeInitialState)
  const [fileHandle, setFileHandle] = useState<LibraryFileHandle | null>(null)
  const [libraryStatus, setLibraryStatus] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [isWordHost, setIsWordHost] = useState(false)
  const [insertStatus, setInsertStatus] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const activeEntry = library.entries.find((e) => e.id === activeId) ?? library.entries[0]

  useEffect(() => {
    detectWordHost().then(setIsWordHost)
  }, [])

  const { tree, layout, options, error } = useMemo(() => {
    const options = { ...defaultLayoutOptions, measureText: canvasMeasureText }
    try {
      const tree = parseTree(activeEntry.input)
      return { tree, layout: layoutTree(tree, options), options, error: null as string | null }
    } catch (e) {
      const message = e instanceof ParseError ? `${e.message} (位置 ${e.position})` : String(e)
      return { tree: null, layout: null, options, error: message }
    }
  }, [activeEntry.input])

  const arrows = useMemo(() => (tree ? detectMovementArrows(tree) : []), [tree])

  const updateActiveEntry = (
    patch: Partial<{
      name: string
      input: string
      adjustments: Adjustments
      arrowAdjustments: ArrowAdjustments
      aspectScale: AspectScale
    }>,
  ) => {
    setState((prev) => ({
      ...prev,
      library: {
        ...prev.library,
        entries: prev.library.entries.map((e) => (e.id === prev.activeId ? { ...e, ...patch } : e)),
      },
    }))
  }

  const handleAdjustNode = (path: string, adjustment: NodeAdjustment) => {
    updateActiveEntry({ adjustments: { ...activeEntry.adjustments, [path]: adjustment } })
  }

  const handleResetNode = (path: string) => {
    if (!(path in activeEntry.adjustments)) return
    const next = { ...activeEntry.adjustments }
    delete next[path]
    updateActiveEntry({ adjustments: next })
  }

  const handleResetAll = () => updateActiveEntry({ adjustments: {}, arrowAdjustments: {} })

  const handleAdjustArrow = (id: string, adjustment: NodeAdjustment) => {
    updateActiveEntry({ arrowAdjustments: { ...activeEntry.arrowAdjustments, [id]: adjustment } })
  }

  const handleResetArrow = (id: string) => {
    if (!(id in activeEntry.arrowAdjustments)) return
    const next = { ...activeEntry.arrowAdjustments }
    delete next[id]
    updateActiveEntry({ arrowAdjustments: next })
  }

  // Aspect-ratio percentages are edited as text so the field can be blank/mid-edit;
  // only a valid positive number is committed as a scale factor.
  const handleAspectScaleChange = (axis: 'x' | 'y', percentText: string) => {
    const percent = Number(percentText)
    if (!Number.isFinite(percent) || percent <= 0) return
    updateActiveEntry({ aspectScale: { ...activeEntry.aspectScale, [axis]: percent / 100 } })
  }

  const handleResetAspectScale = () => updateActiveEntry({ aspectScale: { x: 1, y: 1 } })

  const handleNewEntry = () => {
    const entry = createEntry(`新規${library.entries.length + 1}`, SAMPLE)
    setState((prev) => ({ library: { ...prev.library, entries: [...prev.library.entries, entry] }, activeId: entry.id }))
  }

  const handleDeleteEntry = (id: string) => {
    let entries = library.entries.filter((e) => e.id !== id)
    if (entries.length === 0) entries = [createEntry('新規1', SAMPLE)]
    setState({
      library: { ...library, entries },
      activeId: id === activeId ? entries[0].id : activeId,
    })
  }

  const handleCopyImage = async () => {
    if (!svgRef.current) return
    try {
      await copyPngToClipboard(svgRef.current)
      setCopyStatus('画像をクリップボードにコピーしました。')
    } catch (e) {
      setCopyStatus(`コピーに失敗しました: ${String(e)}`)
    }
    setTimeout(() => setCopyStatus(null), 3000)
  }

  const handleCopyForestCode = async () => {
    if (!tree) return
    try {
      await navigator.clipboard.writeText(treeToForestCode(tree))
      setCopyStatus('forestコードをクリップボードにコピーしました。')
    } catch (e) {
      setCopyStatus(`コピーに失敗しました: ${String(e)}`)
    }
    setTimeout(() => setCopyStatus(null), 3000)
  }

  const handleInsertIntoWord = async () => {
    if (!layout) return
    setInsertStatus('挿入中...')
    try {
      const ooxml = layoutToOoxml(layout, options, activeEntry.adjustments, arrows, activeEntry.arrowAdjustments, {
        scaleX: activeEntry.aspectScale.x,
        scaleY: activeEntry.aspectScale.y,
      })
      await insertOoxmlIntoWord(ooxml)
      setInsertStatus('Wordに挿入しました。図形を選択して「グループ解除」すると個別に編集できます。')
    } catch (e) {
      setInsertStatus(`挿入に失敗しました: ${String(e)}`)
    }
  }

  const handleOpenEditor = () => {
    openEditorDialog(
      {
        input: activeEntry.input,
        adjustments: activeEntry.adjustments,
        arrowAdjustments: activeEntry.arrowAdjustments,
        aspectScale: activeEntry.aspectScale,
      },
      (state) => {
        updateActiveEntry({
          input: state.input,
          adjustments: state.adjustments,
          arrowAdjustments: state.arrowAdjustments,
          aspectScale: state.aspectScale,
        })
      },
    )
  }

  const handleApplyFromDialog = () => {
    applyAndCloseDialog({
      input: activeEntry.input,
      adjustments: activeEntry.adjustments,
      arrowAdjustments: activeEntry.arrowAdjustments,
      aspectScale: activeEntry.aspectScale,
    })
  }

  const handleSaveLibrary = async () => {
    try {
      if (fileHandle) {
        await fileHandle.save(library)
        setLibraryStatus(`${fileHandle.name} に保存しました。`)
      } else {
        const handle = await saveLibraryAsNewFile(library)
        if (handle) {
          setFileHandle(handle)
          setLibraryStatus(`${handle.name} に保存しました。`)
        }
      }
    } catch (e) {
      setLibraryStatus(`保存に失敗しました: ${String(e)}`)
    }
  }

  const handleOpenLibrary = async () => {
    try {
      const result = await openLibraryFile()
      if (!result) return
      const entries = result.library.entries.length > 0 ? result.library.entries : [createEntry('新規1', SAMPLE)]
      setState({ library: { version: 1, entries }, activeId: entries[0].id })
      setFileHandle(result.handle)
      setLibraryStatus(`${result.handle.name} を読み込みました。`)
    } catch (e) {
      const message = e instanceof LibraryParseError ? e.message : String(e)
      setLibraryStatus(`読み込みに失敗しました: ${message}`)
    }
  }

  const { width: contentWidth, height: contentHeight } = layout
    ? canvasSize(layout, arrows, options, activeEntry.adjustments, activeEntry.arrowAdjustments, activeEntry.aspectScale.x, activeEntry.aspectScale.y)
    : { width: 0, height: 0 }

  return (
    <div id="app-shell" className={isDialog ? 'dialog-mode' : undefined}>
      <header>
        <h1>Dendrograph{isDialog ? '(編集ウィンドウ)' : ''}</h1>
        <p>ラベル付き括弧記法から樹形図を自動生成します。ノードはドラッグで位置調整、ダブルクリックで個別リセットできます。</p>
      </header>
      <main>
        <section id="editor-pane">
          {!isDialog && (
            <>
              <div id="library-toolbar">
                <button type="button" onClick={handleOpenLibrary}>
                  リストを開く
                </button>
                <button type="button" onClick={handleSaveLibrary}>
                  リストを保存
                </button>
              </div>
              <ul id="entry-list">
                {library.entries.map((e) => (
                  <li key={e.id} className={e.id === activeId ? 'active' : undefined}>
                    <button type="button" className="entry-select" onClick={() => setState((prev) => ({ ...prev, activeId: e.id }))}>
                      {e.name || '(無題)'}
                    </button>
                    <button type="button" className="entry-delete" onClick={() => handleDeleteEntry(e.id)} aria-label="削除">
                      ×
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className="entry-add" onClick={handleNewEntry}>
                    + 新規ペア
                  </button>
                </li>
              </ul>
              {libraryStatus && <p className="status">{libraryStatus}</p>}

              <label htmlFor="entry-name">名前</label>
              <input
                id="entry-name"
                type="text"
                value={activeEntry.name}
                onChange={(e) => updateActiveEntry({ name: e.target.value })}
              />
            </>
          )}

          <label htmlFor="bracket-input">ブラケット記法</label>
          <textarea
            id="bracket-input"
            value={activeEntry.input}
            onChange={(e) => updateActiveEntry({ input: e.target.value })}
            spellCheck={false}
          />
          {error && <p className="error">{error}</p>}

          <div id="aspect-toolbar">
            <label htmlFor="aspect-x">横</label>
            <input
              id="aspect-x"
              type="number"
              min={10}
              max={400}
              step={5}
              value={Math.round(activeEntry.aspectScale.x * 100)}
              onChange={(e) => handleAspectScaleChange('x', e.target.value)}
            />
            <span>%</span>
            <label htmlFor="aspect-y">縦</label>
            <input
              id="aspect-y"
              type="number"
              min={10}
              max={400}
              step={5}
              value={Math.round(activeEntry.aspectScale.y * 100)}
              onChange={(e) => handleAspectScaleChange('y', e.target.value)}
            />
            <span>%</span>
            <button
              type="button"
              onClick={handleResetAspectScale}
              disabled={activeEntry.aspectScale.x === 1 && activeEntry.aspectScale.y === 1}
            >
              100%に戻す
            </button>
          </div>

          <div id="toolbar">
            <button
              type="button"
              onClick={handleResetAll}
              disabled={Object.keys(activeEntry.adjustments).length === 0 && Object.keys(activeEntry.arrowAdjustments).length === 0}
            >
              位置をすべてリセット
            </button>
            <button type="button" onClick={() => svgRef.current && downloadSvg(svgRef.current)} disabled={!layout}>
              SVGをダウンロード
            </button>
            <button type="button" onClick={() => svgRef.current && downloadPng(svgRef.current)} disabled={!layout}>
              PNGをダウンロード
            </button>
            <button type="button" onClick={handleCopyImage} disabled={!layout}>
              画像をコピー
            </button>
            <button type="button" onClick={handleCopyForestCode} disabled={!tree}>
              forestコードをコピー
            </button>
            {isDialog ? (
              <button type="button" onClick={handleApplyFromDialog}>
                タスクペインに反映して閉じる
              </button>
            ) : (
              <>
                {isWordHost && (
                  <button type="button" onClick={handleInsertIntoWord} disabled={!layout}>
                    Wordに挿入
                  </button>
                )}
                {isWordHost && (
                  <button type="button" onClick={handleOpenEditor}>
                    大きな画面で編集
                  </button>
                )}
              </>
            )}
          </div>
          {copyStatus && <p className="status">{copyStatus}</p>}
          {insertStatus && <p className="status">{insertStatus}</p>}
        </section>
        <section id="preview-pane">
          {layout && (
            <ZoomPanViewport contentWidth={contentWidth} contentHeight={contentHeight} height={isDialog ? '80vh' : 340}>
              <TreeCanvas
                ref={svgRef}
                layout={layout}
                options={options}
                adjustments={activeEntry.adjustments}
                onAdjustNode={handleAdjustNode}
                onResetNode={handleResetNode}
                arrows={arrows}
                arrowAdjustments={activeEntry.arrowAdjustments}
                onAdjustArrow={handleAdjustArrow}
                onResetArrow={handleResetArrow}
                scaleX={activeEntry.aspectScale.x}
                scaleY={activeEntry.aspectScale.y}
              />
            </ZoomPanViewport>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
