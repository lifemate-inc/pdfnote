import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePdfStore, StampData } from '../stores/usePdfStore'
import { getCurrentPdf, renderPageToCanvas } from '../lib/pdfLoader'
import { savePdfWithStamps } from '../lib/pdfEditor'
import { saveFile } from '../lib/fsAccess'

// ============================================================
// 定数
// ============================================================

const DEFAULT_SCALE = 1.4
const MIN_SCALE = 0.4
const MAX_SCALE = 3.0
const SCALE_STEP = 0.15
const A4_RATIO = 1.414

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
// PendingMemo
// ============================================================

interface PendingMemo {
  pageNum: number
  relX: number
  relY: number
  screenX: number
  screenY: number
}

// ============================================================
// ScrollPage: 1ページ分の遅延レンダリング
// ============================================================

interface ScrollPageProps {
  pageNum: number
  scale: number
  memoMode: boolean
  isPendingPage: boolean
  onPageClick: (pageNum: number, relX: number, relY: number, screenX: number, screenY: number) => void
}

const ScrollPage: React.FC<ScrollPageProps> = React.memo(({
  pageNum,
  scale,
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
  const [pageW, setPageW] = useState(Math.round(595 * scale))
  const [pageH, setPageH] = useState(Math.round(595 * scale * A4_RATIO))

  // scale/rotation が変わったら寸法も推定値でリセット
  useEffect(() => {
    setPageW(Math.round(595 * scale))
    setPageH(Math.round(595 * scale * A4_RATIO))
  }, [scale])

  // ページをキャンバスに描画
  const doRender = useCallback(async () => {
    const pdf = getCurrentPdf()
    const canvas = canvasRef.current
    if (!pdf || !canvas) return
    try {
      const { width, height } = await renderPageToCanvas(pdf, pageNum, scale, canvas, rotation)
      setPageW(width)
      setPageH(height)
      renderedRef.current = true
    } catch (e) {
      console.error(`Page ${pageNum} render error:`, e)
    }
  }, [pageNum, scale, rotation])

  // IntersectionObserver: スケール・回転が変わると doRender が変わり再接続 → 再描画
  useEffect(() => {
    renderedRef.current = false  // スケール/回転変化時にリセット

    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !renderedRef.current) {
          doRender()
        }
      },
      { rootMargin: '700px 0px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [doRender])

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!memoMode) return
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    onPageClick(
      pageNum,
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
      e.clientX,
      e.clientY,
    )
  }

  return (
    <div className="flex justify-center mb-8" id={`page-${pageNum}`}>
      <div
        ref={containerRef}
        className="relative shadow-2xl bg-gray-200"
        style={{ width: pageW, height: pageH }}
      >
        <canvas ref={canvasRef} className="block" />

        {/* メモオーバーレイ */}
        <div
          className={`absolute inset-0 ${memoMode ? 'cursor-crosshair' : 'cursor-default'}`}
          onClick={handleOverlayClick}
        >
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

          {isPendingPage && memoMode && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'rgba(59,130,246,0.06)', outline: '2px solid rgba(59,130,246,0.4)' }}
            />
          )}
        </div>

        {/* ページ番号ラベル（右下） */}
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
// MemoPopup: テキスト追加ポップアップ（position: fixed）
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

  const popupW = 256
  const popupH = 310
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
      <div className="mb-2 text-xs font-semibold text-gray-500">テキストを追加</div>

      <div className="mb-2 flex flex-wrap gap-1">
        {PRESET_MEMOS.map((preset) => (
          <button
            key={preset}
            onClick={() => setText(preset)}
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
              text === preset ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="テキストを入力..."
        className="mb-2 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
      />

      <div className="mb-2 flex items-center gap-1">
        <span className="text-xs text-gray-400 mr-1">サイズ</span>
        {MEMO_SIZES.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFontSize(value)}
            className={`rounded px-2 py-0.5 text-xs ${fontSize === value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {label}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} className="rounded" />
          太字
        </label>
      </div>

      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-xs text-gray-400 mr-1">色</span>
        {MEMO_COLORS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setColor(value)}
            className={`h-6 w-6 rounded-full border-2 transition-transform ${color === value ? 'border-gray-800 scale-110' : 'border-transparent'}`}
            style={{ background: value }}
            title={label}
          />
        ))}
      </div>

      {text && (
        <div className="mb-2 rounded bg-gray-50 px-2 py-1 text-center">
          <span style={{ fontSize: fontSize * 0.6, color, fontWeight: bold ? 'bold' : 'normal' }}>{text}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-300 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
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
    thumbnails,
    stamps,
    addStamp,
    setAppView,
    setFileName,
    previewPageNum,
  } = usePdfStore()

  // ズームスケール
  const [scale, setScale] = useState(DEFAULT_SCALE)

  // メモモード
  const [memoMode, setMemoMode] = useState(false)
  const [pendingMemo, setPendingMemo] = useState<PendingMemo | null>(null)

  // 現在ページ（スクロール位置から推定）
  const [currentPage, setCurrentPage] = useState(previewPageNum)
  const [showPageIndicator, setShowPageIndicator] = useState(false)
  const indicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ファイル名リネーム
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(fileName.replace(/\.pdf$/i, ''))

  // 保存状態
  const [isSaving, setIsSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // 初期スクロール位置
  useEffect(() => {
    if (previewPageNum <= 1) return
    const container = scrollContainerRef.current
    if (!container) return
    const estimatedH = Math.round(595 * scale * A4_RATIO) + 32
    container.scrollTop = (previewPageNum - 1) * estimatedH
    setCurrentPage(previewPageNum)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // スクロールでページ番号を推定 + 自動非表示タイマー
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const estimatedH = Math.round(595 * scale * A4_RATIO) + 32
    const estimated = Math.max(1, Math.ceil((container.scrollTop + 32) / estimatedH))
    setCurrentPage(Math.min(estimated, pageCount))

    // ページ表示インジケーターを表示して2.5秒後に非表示
    setShowPageIndicator(true)
    if (indicatorTimerRef.current) clearTimeout(indicatorTimerRef.current)
    indicatorTimerRef.current = setTimeout(() => setShowPageIndicator(false), 2500)
  }, [pageCount, scale])

  // サイドバー: 現在ページのサムネイルを表示させる
  useEffect(() => {
    const el = document.getElementById(`sidebar-thumb-${currentPage}`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentPage])

  // ページへスクロール
  const scrollToPage = useCallback((pageNum: number) => {
    const el = document.getElementById(`page-${pageNum}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Ctrl+ホイールズーム
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP
      setScale((prev) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round((prev + delta) * 10) / 10)))
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [])

  // キーボードショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault()
          setScale((p) => Math.min(MAX_SCALE, Math.round((p + SCALE_STEP) * 10) / 10))
        } else if (e.key === '-') {
          e.preventDefault()
          setScale((p) => Math.max(MIN_SCALE, Math.round((p - SCALE_STEP) * 10) / 10))
        } else if (e.key === '0') {
          e.preventDefault()
          setScale(DEFAULT_SCALE)
        }
        return
      }
      if (e.key === 'Escape') {
        if (pendingMemo) setPendingMemo(null)
        else if (memoMode) setMemoMode(false)
        else if (isEditingName) setIsEditingName(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingMemo, memoMode, isEditingName])

  // ページクリック（テキスト追加）
  const handlePageClick = useCallback(
    (pageNum: number, relX: number, relY: number, screenX: number, screenY: number) => {
      setPendingMemo({ pageNum, relX, relY, screenX, screenY })
    },
    [],
  )

  // テキスト追加確定
  const handleAddMemo = useCallback(
    (stamp: StampData) => {
      if (!pendingMemo) return
      addStamp(pendingMemo.pageNum, stamp)
      setPendingMemo(null)
    },
    [pendingMemo, addStamp],
  )

  // 全ページ保存
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

  // 印刷（PDFをblobで新タブ表示）
  const handlePrint = () => {
    const { pdfArrayBuffer } = usePdfStore.getState()
    if (!pdfArrayBuffer) return
    const blob = new Blob([pdfArrayBuffer.slice(0)], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }

  // ファイル名保存
  const handleNameSave = () => {
    const newName = editedName.trim()
    if (newName) {
      setFileName(newName.endsWith('.pdf') ? newName : `${newName}.pdf`)
    }
    setIsEditingName(false)
  }

  const totalMemos = stamps.reduce((sum, s) => sum + s.length, 0)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-600">

      {/* ===== ヘッダー ===== */}
      <div className="flex items-center gap-2 bg-white px-3 py-2 shadow-sm flex-wrap flex-shrink-0">

        {/* ファイル名 + リネーム */}
        <div className="flex items-center gap-1 min-w-0">
          <svg className="h-4 w-4 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSave()
                  if (e.key === 'Escape') setIsEditingName(false)
                }}
                className="rounded border border-blue-400 px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-blue-200 w-48"
              />
              <button onClick={handleNameSave} className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700">保存</button>
              <button onClick={() => setIsEditingName(false)} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">×</button>
            </div>
          ) : (
            <div className="flex items-center gap-1 group">
              <span className="truncate text-sm font-medium text-gray-700 max-w-[200px]" title={fileName}>
                {fileName}
              </span>
              <button
                onClick={() => { setEditedName(fileName.replace(/\.pdf$/i, '')); setIsEditingName(true) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                title="ファイル名を変更"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* ページ一覧 */}
        <button
          onClick={() => setAppView('list')}
          className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          title="サムネイル一覧・分割・回転・ページ抽出"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          ページ一覧
        </button>

        {/* ズームコントロール */}
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 px-1.5 py-1">
          <button
            onClick={() => setScale((p) => Math.max(MIN_SCALE, Math.round((p - SCALE_STEP) * 10) / 10))}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-sm font-bold"
            title="縮小 (Ctrl+-)"
          >−</button>
          <button
            onClick={() => setScale(DEFAULT_SCALE)}
            className="min-w-[42px] text-center text-xs text-gray-500 hover:text-blue-600 tabular-nums"
            title="クリックで100%にリセット"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={() => setScale((p) => Math.min(MAX_SCALE, Math.round((p + SCALE_STEP) * 10) / 10))}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-sm font-bold"
            title="拡大 (Ctrl++)"
          >＋</button>
        </div>

        <div className="flex-1" />

        {totalMemos > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 flex-shrink-0">
            ✏ {totalMemos}件
          </span>
        )}

        {/* 印刷ボタン */}
        <button
          onClick={handlePrint}
          className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0"
          title="新しいタブで開いて印刷（Ctrl+P）"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          印刷
        </button>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm flex-shrink-0"
          title="テキストメモを焼き込んでPDFを保存"
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

      {/* ===== メインエリア: サイドバー + スクロールビュー ===== */}
      <div className="flex flex-1 overflow-hidden">

        {/* 左サイドバー: サムネイル一覧 */}
        <div
          ref={sidebarRef}
          className="w-[76px] flex-shrink-0 overflow-y-auto bg-gray-800 py-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              id={`sidebar-thumb-${n}`}
              className={`mx-1.5 mb-1.5 cursor-pointer rounded overflow-hidden transition-all ${
                n === currentPage
                  ? 'ring-2 ring-blue-400 opacity-100'
                  : 'opacity-50 hover:opacity-80'
              }`}
              onClick={() => scrollToPage(n)}
              title={`${n}ページ目へ`}
            >
              {thumbnails[n - 1] ? (
                <img
                  src={thumbnails[n - 1]}
                  className="w-full block"
                  draggable={false}
                  alt={`${n}p`}
                />
              ) : (
                <div className="w-full bg-gray-700" style={{ aspectRatio: '1/1.414' }} />
              )}
              <div className="text-center text-xs py-0.5 truncate px-0.5 font-medium"
                style={{ color: n === currentPage ? '#93c5fd' : '#6b7280', fontSize: 10 }}>
                {n}
              </div>
            </div>
          ))}
        </div>

        {/* メインスクロールエリア */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto py-8 px-4"
          onScroll={handleScroll}
          onClick={(e) => {
            if (pendingMemo && e.target === e.currentTarget) setPendingMemo(null)
          }}
        >
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
            <ScrollPage
              key={pageNum}
              pageNum={pageNum}
              scale={scale}
              memoMode={memoMode}
              isPendingPage={pendingMemo?.pageNum === pageNum}
              onPageClick={handlePageClick}
            />
          ))}
        </div>
      </div>

      {/* ===== 右下: ページ番号 + テキスト追加ボタン ===== */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 pointer-events-none">

        {/* 現在ページ表示（スクロール中のみ） */}
        <div
          className={`pointer-events-none rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white tabular-nums shadow-lg transition-all duration-300 ${
            showPageIndicator ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          {currentPage} / {pageCount}
        </div>

        {/* テキスト追加ガイド */}
        {memoMode && (
          <div className="pointer-events-auto rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 shadow-lg text-center max-w-[160px]">
            追記したい箇所をクリック
            <br /><span className="text-amber-400">Esc でキャンセル</span>
          </div>
        )}

        {/* テキストを追加ボタン */}
        <button
          onClick={() => { setMemoMode((m) => !m); setPendingMemo(null) }}
          className={`pointer-events-auto flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-all ${
            memoMode
              ? 'bg-amber-500 text-white hover:bg-amber-600 ring-4 ring-amber-200'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
          }`}
          title={memoMode ? 'テキスト追加モードを終了' : 'PDF上にテキストを追加（Ctrl+スクロールでズーム）'}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {memoMode ? 'テキスト追加中...' : 'テキストを追加'}
        </button>
      </div>

      {/* ===== テキスト入力ポップアップ ===== */}
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
