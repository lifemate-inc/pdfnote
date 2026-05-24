import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePdfStore, StampData } from '../stores/usePdfStore'
import { getCurrentPdf, renderPageToCanvas } from '../lib/pdfLoader'
import { savePdfWithStamps } from '../lib/pdfEditor'
import { saveFile } from '../lib/fsAccess'

// ============================================================
// 定数
// ============================================================

const VIEWER_SCALE = 1.4
const A4_RATIO = 1.414  // A4 高さ/幅（初期プレースホルダー用）
// A4 の 1 ページあたりの推定高さ（px） + mb-8(32px)
const ESTIMATED_PAGE_HEIGHT = Math.round(595 * VIEWER_SCALE * A4_RATIO) + 32

const MEMO_SIZES = [
  { label: '小', value: 16 },
  { label: '中', value: 22 },
  { label: '大', value: 32 },
]
const MEMO_COLORS = [
  { label: '黒', value: '#000000' },
  { label: '赤', value: '#dc2626' },
  { label: '青', value: '#2563eb' },
  { label: '緑', value: '#16a34a' },
]
const PRESET_MEMOS = ['確認済', '要対応', '承認', '保留', '完了', '要確認']

// ============================================================
// PendingMemo: メモ追加待機状態
// ============================================================

interface PendingMemo {
  pageNum: number
  /** ページ内の相対位置 (0〜1) */
  relX: number
  relY: number
  /** 画面座標（ポップアップ表示位置用） */
  screenX: number
  screenY: number
}

// ============================================================
// ScrollPage: 1ページ分の遅延レンダリングコンポーネント
// ============================================================

interface ScrollPageProps {
  pageNum: number
  memoMode: boolean
  isPendingPage: boolean
  onPageClick: (pageNum: number, relX: number, relY: number, screenX: number, screenY: number) => void
}

const ScrollPage: React.FC<ScrollPageProps> = React.memo(({
  pageNum,
  memoMode,
  isPendingPage,
  onPageClick,
}) => {
  const rotation = usePdfStore((s) => s.rotations[pageNum - 1] ?? 0)
  const memos = usePdfStore((s) => s.stamps[pageNum - 1] ?? [])
  const removeStamp = usePdfStore((s) => s.removeStamp)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderedRef = useRef(false)
  const prevRotationRef = useRef(rotation)
  const [pageW, setPageW] = useState(Math.round(595 * VIEWER_SCALE))
  const [pageH, setPageH] = useState(Math.round(595 * VIEWER_SCALE * A4_RATIO))

  // ページをキャンバスに描画する関数
  const doRender = useCallback(async () => {
    const pdf = getCurrentPdf()
    const canvas = canvasRef.current
    if (!pdf || !canvas) return
    try {
      const { width, height } = await renderPageToCanvas(
        pdf, pageNum, VIEWER_SCALE, canvas, rotation,
      )
      setPageW(width)
      setPageH(height)
      renderedRef.current = true
    } catch (e) {
      console.error(`ページ ${pageNum} の描画エラー:`, e)
    }
  }, [pageNum, rotation])

  // 初回: IntersectionObserver で遅延レンダリング
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !renderedRef.current) {
          doRender()
        }
      },
      { rootMargin: '600px 0px', threshold: 0 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [doRender])

  // 回転変更時: 既にレンダリング済みなら即座に再描画
  useEffect(() => {
    if (prevRotationRef.current !== rotation) {
      prevRotationRef.current = rotation
      renderedRef.current = false
      doRender()
    }
  }, [rotation, doRender])

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!memoMode) return
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    const relY = (e.clientY - rect.top) / rect.height
    onPageClick(pageNum, relX, relY, e.clientX, e.clientY)
  }

  return (
    <div className="flex justify-center mb-8" id={`page-${pageNum}`}>
      <div
        ref={containerRef}
        className="relative shadow-2xl bg-gray-200"
        style={{ width: pageW, height: pageH }}
      >
        {/* PDF レンダリングキャンバス */}
        <canvas
          ref={canvasRef}
          className="block"
        />

        {/* メモ + クリック検知オーバーレイ */}
        <div
          className={`absolute inset-0 ${memoMode ? 'cursor-crosshair' : 'cursor-default'}`}
          onClick={handleOverlayClick}
        >
          {/* 既存メモの表示 */}
          {memos.map((memo) => (
            <div
              key={memo.id}
              className="absolute whitespace-nowrap cursor-pointer hover:opacity-70 transition-opacity"
              style={{
                left: `${memo.x * 100}%`,
                top: `${memo.y * 100}%`,
                fontSize: memo.fontSize,
                color: memo.color,
                fontWeight: memo.bold ? 'bold' : 'normal',
                transform: 'translate(-50%, -50%)',
                textShadow: '0 0 4px rgba(255,255,255,0.9)',
                border: '1px dashed rgba(0,0,0,0.25)',
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.6)',
                userSelect: 'none',
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(`「${memo.text}」を削除しますか？`)) {
                  removeStamp(pageNum, memo.id)
                }
              }}
              title="クリックで削除"
            >
              {memo.text}
            </div>
          ))}

          {/* メモ追加中のハイライト */}
          {isPendingPage && memoMode && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'rgba(59,130,246,0.06)', outline: '2px solid rgba(59,130,246,0.4)' }}
            />
          )}
        </div>

        {/* ページ番号ラベル */}
        <div className="absolute bottom-2 right-3 rounded bg-black/30 px-2 py-0.5 text-xs text-white select-none pointer-events-none">
          {pageNum}
        </div>

        {/* メモありバッジ */}
        {memos.length > 0 && (
          <div className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-white select-none pointer-events-none">
            ✏ {memos.length}
          </div>
        )}
      </div>
    </div>
  )
})

ScrollPage.displayName = 'ScrollPage'

// ============================================================
// MemoPopup: メモ入力ポップアップ（position: fixed）
// ============================================================

interface MemoPopupProps {
  pending: PendingMemo
  onAdd: (stamp: StampData) => void
  onCancel: () => void
}

const MemoPopup: React.FC<MemoPopupProps> = ({ pending, onAdd, onCancel }) => {
  const [text, setText] = useState('')
  const [fontSize, setFontSize] = useState(22)
  const [color, setColor] = useState('#dc2626')
  const [bold, setBold] = useState(false)

  // ポップアップがビューポートに収まるよう位置調整
  const popupW = 256
  const popupH = 300
  const left = Math.min(pending.screenX + 12, window.innerWidth - popupW - 16)
  const top = Math.min(Math.max(pending.screenY - 20, 8), window.innerHeight - popupH - 8)

  const handleAdd = () => {
    if (!text.trim()) return
    onAdd({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      x: pending.relX,
      y: pending.relY,
      text: text.trim(),
      fontSize,
      color,
      bold,
    })
  }

  return (
    <div
      className="fixed z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* プリセット */}
      <div className="mb-2 flex flex-wrap gap-1">
        {PRESET_MEMOS.map((preset) => (
          <button
            key={preset}
            onClick={() => setText(preset)}
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
              text === preset
                ? 'border-blue-400 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* テキスト入力 */}
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="メモのテキスト"
        className="mb-2 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
      />

      {/* サイズ選択 */}
      <div className="mb-2 flex items-center gap-1">
        <span className="text-xs text-gray-400 mr-1">サイズ</span>
        {MEMO_SIZES.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFontSize(value)}
            className={`rounded px-2 py-0.5 text-xs ${
              fontSize === value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={bold}
            onChange={(e) => setBold(e.target.checked)}
            className="rounded"
          />
          太字
        </label>
      </div>

      {/* 色選択 */}
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-xs text-gray-400 mr-1">色</span>
        {MEMO_COLORS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setColor(value)}
            className={`h-6 w-6 rounded-full border-2 transition-transform ${
              color === value ? 'border-gray-800 scale-110' : 'border-transparent'
            }`}
            style={{ background: value }}
            title={label}
          />
        ))}
      </div>

      {/* プレビュー */}
      {text && (
        <div className="mb-2 rounded bg-gray-50 px-2 py-1 text-center">
          <span
            style={{
              fontSize: fontSize * 0.6,
              color,
              fontWeight: bold ? 'bold' : 'normal',
            }}
          >
            {text}
          </span>
        </div>
      )}

      {/* ボタン */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          キャンセル
        </button>
        <button
          onClick={handleAdd}
          disabled={!text.trim()}
          className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-blue-700"
        >
          追加
        </button>
      </div>
    </div>
  )
}

// ============================================================
// ScrollViewer: メイン閲覧コンポーネント
// ============================================================

export const ScrollViewer: React.FC = () => {
  const {
    pageCount,
    fileName,
    stamps,
    addStamp,
    setAppView,
    previewPageNum,
  } = usePdfStore()

  // メモモード
  const [memoMode, setMemoMode] = useState(false)
  const [pendingMemo, setPendingMemo] = useState<PendingMemo | null>(null)

  // 現在表示中のページ番号（スクロール位置から推定）
  const [currentPage, setCurrentPage] = useState(previewPageNum)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // 初期スクロール位置（previewPageNum に対応するページへ）
  useEffect(() => {
    if (previewPageNum <= 1) return
    const container = scrollContainerRef.current
    if (!container) return
    const targetY = (previewPageNum - 1) * ESTIMATED_PAGE_HEIGHT
    container.scrollTop = targetY
    setCurrentPage(previewPageNum)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // スクロールイベントで現在ページを追跡
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    // scrollTop + padding(32px) を使ってページ番号を推定
    const scrollTop = container.scrollTop + 32
    const estimated = Math.max(1, Math.ceil(scrollTop / ESTIMATED_PAGE_HEIGHT))
    setCurrentPage(Math.min(estimated, pageCount))
  }, [pageCount])

  // 保存状態
  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)

  // ページクリック（メモ追加）
  const handlePageClick = useCallback(
    (pageNum: number, relX: number, relY: number, screenX: number, screenY: number) => {
      setPendingMemo({ pageNum, relX, relY, screenX, screenY })
    },
    [],
  )

  // メモ追加確定
  const handleAddMemo = useCallback(
    (stamp: StampData) => {
      if (!pendingMemo) return
      addStamp(pendingMemo.pageNum, stamp)
      setPendingMemo(null)
    },
    [pendingMemo, addStamp],
  )

  // キーボードショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingMemo) {
          setPendingMemo(null)
        } else if (memoMode) {
          setMemoMode(false)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingMemo, memoMode])

  // 全ページ保存（メモ焼き込み）
  const handleSave = async () => {
    setIsSaving(true)
    setSaveProgress(0)
    try {
      const { stamps: allStamps, rotations } = usePdfStore.getState()
      const bytes = await savePdfWithStamps(allStamps, rotations, (current, total) => {
        setSaveProgress(Math.round((current / total) * 100))
      })
      const outName = fileName.replace(/\.pdf$/i, '') + '_メモ済.pdf'
      await saveFile(bytes, outName)
    } catch (err) {
      alert(`保存エラー: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSaving(false)
      setSaveProgress(0)
    }
  }

  // メモの総数
  const totalMemos = stamps.reduce((sum, s) => sum + s.length, 0)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-600">
      {/* ===== ヘッダー ===== */}
      <div className="flex items-center gap-2 bg-white px-4 py-2 shadow-sm flex-wrap flex-shrink-0">
        {/* ファイル名 */}
        <div className="flex items-center gap-1.5 min-w-0">
          <svg className="h-4 w-4 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="truncate text-sm font-medium text-gray-700 max-w-[220px]" title={fileName}>
            {fileName}
          </span>
        </div>

        {/* 現在ページ表示 */}
        <div className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 tabular-nums flex-shrink-0">
          {currentPage} / {pageCount}
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* ページ一覧ボタン */}
        <button
          onClick={() => setAppView('list')}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          title="サムネイル一覧・分割・回転・ページ抽出"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          ページ一覧
        </button>

        <div className="flex-1" />

        {/* メモありバッジ */}
        {totalMemos > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 flex-shrink-0">
            ✏ {totalMemos}件のメモ
          </span>
        )}

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm flex-shrink-0"
          title="メモを焼き込んでPDFを保存"
        >
          {isSaving ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              保存中... {saveProgress}%
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              PDFを保存
            </>
          )}
        </button>
      </div>

      {/* ===== スクロールエリア ===== */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto py-8 px-4"
        onScroll={handleScroll}
        onClick={(e) => {
          // オーバーレイ外クリックでポップアップキャンセル
          if (pendingMemo && e.target === e.currentTarget) {
            setPendingMemo(null)
          }
        }}
      >
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
          <ScrollPage
            key={pageNum}
            pageNum={pageNum}
            memoMode={memoMode}
            isPendingPage={pendingMemo?.pageNum === pageNum}
            onPageClick={handlePageClick}
          />
        ))}
      </div>

      {/* ===== 浮きメモ追加ボタン（右下） ===== */}
      <div className="fixed bottom-8 right-8 z-40 flex flex-col items-end gap-2 pointer-events-none">
        {memoMode && (
          <div className="pointer-events-auto rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 shadow-lg max-w-[180px] text-center">
            追記したい箇所をクリック
            <br />
            <span className="text-amber-400">Esc でキャンセル</span>
          </div>
        )}
        <button
          onClick={() => {
            setMemoMode((m) => !m)
            setPendingMemo(null)
          }}
          className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-all ${
            memoMode
              ? 'bg-amber-500 text-white hover:bg-amber-600 ring-4 ring-amber-200'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
          }`}
          title={memoMode ? 'メモ追加モードを終了' : 'PDF上にテキストメモを追加'}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          {memoMode ? 'メモ追加中...' : 'メモを追加'}
        </button>
      </div>

      {/* ===== メモ入力ポップアップ ===== */}
      {pendingMemo && (
        <MemoPopup
          pending={pendingMemo}
          onAdd={handleAddMemo}
          onCancel={() => setPendingMemo(null)}
        />
      )}
    </div>
  )
}
