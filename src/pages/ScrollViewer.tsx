import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePdfStore, StampData } from '../stores/usePdfStore'
import { getCurrentPdf, renderPageToCanvas } from '../lib/pdfLoader'
import { buildPdfAllPages } from '../lib/pdfEditor'
import { saveFile } from '../lib/fsAccess'

// ============================================================
// 定数
// ============================================================

const DEFAULT_SCALE = 1.4
const MIN_SCALE = 0.4
const MAX_SCALE = 3.0
const SCALE_STEP = 0.15
const A4_RATIO = 1.414
const DRAG_THRESHOLD = 5

// テキストサイズの範囲（連続値）
const MEMO_SIZE_MIN = 8
const MEMO_SIZE_MAX = 72
const MEMO_SIZE_STEP = 2
const MEMO_SIZE_DEFAULT = 22
const MEMO_COLORS = [
  { label: '黒', value: '#000000' },
  { label: '赤', value: '#dc2626' },
  { label: '青', value: '#2563eb' },
  { label: '緑', value: '#16a34a' },
]
const PRESET_MEMOS = ['確認済', '要対応', '承認', '保留', '完了', '要確認']

// ============================================================
// 型定義
// ============================================================

interface PendingMemo {
  pageNum: number
  relX: number
  relY: number
  screenX: number
  screenY: number
}

interface EditingMemo {
  pageNum: number
  memo: StampData
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
  onMemoClick: (pageNum: number, memo: StampData, screenX: number, screenY: number) => void
}

const ScrollPage: React.FC<ScrollPageProps> = React.memo(({
  pageNum,
  scale,
  memoMode,
  isPendingPage,
  onPageClick,
  onMemoClick,
}) => {
  const rotation = usePdfStore((s) => s.rotations[pageNum - 1] ?? 0)
  const memos = usePdfStore((s) => s.stamps[pageNum - 1] ?? [])
  const updateStamp = usePdfStore((s) => s.updateStamp)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderedRef = useRef(false)
  // ドラッグ直後のclick eventを抑制するフラグ（移動後にedit popupが開くのを防ぐ）
  const justDraggedRef = useRef(false)
  const [pageW, setPageW] = useState(Math.round(595 * scale))
  const [pageH, setPageH] = useState(Math.round(595 * scale * A4_RATIO))

  useEffect(() => {
    setPageW(Math.round(595 * scale))
    setPageH(Math.round(595 * scale * A4_RATIO))
  }, [scale])

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

  useEffect(() => {
    renderedRef.current = false
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !renderedRef.current) doRender()
      },
      { rootMargin: '700px 0px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [doRender])

  // ページ空白部分クリック → memoMode時のみ新規テキスト追加
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

  // メモのドラッグ処理（移動のみ担当・clickによる編集はhandleMemoClickで処理）
  // preventDefaultしない → click eventが発火する → handleMemoClickで編集ポップアップを開く
  const handleMemoPointerDown = (e: React.PointerEvent, memo: StampData) => {
    // マウスの場合、左ボタン以外は無視（右クリックのコンテキストメニューを妨げない）
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    // 注意: e.preventDefault() は呼ばない。click eventの発火を妨げないため

    const container = containerRef.current
    if (!container) return

    const startX = e.clientX
    const startY = e.clientY
    const startRelX = memo.x
    const startRelY = memo.y
    let hasDragged = false

    const handleMove = (me: PointerEvent) => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      if (!hasDragged && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        hasDragged = true
      }
      if (hasDragged) {
        const rect = container.getBoundingClientRect()
        const newRelX = Math.max(0.01, Math.min(0.99, startRelX + dx / rect.width))
        const newRelY = Math.max(0.01, Math.min(0.99, startRelY + dy / rect.height))
        updateStamp(pageNum, memo.id, { x: newRelX, y: newRelY })
      }
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)

      if (hasDragged) {
        // ドラッグした場合: 直後に発火するclick eventを抑制するフラグを立てる
        justDraggedRef.current = true
        setTimeout(() => { justDraggedRef.current = false }, 100)
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  // メモのクリック処理（編集ポップアップを開く）
  // - overlayへの伝播を止める（新規メモが作られるのを防ぐ）
  // - ドラッグ直後のクリックは無視する
  const handleMemoClick = (e: React.MouseEvent, memo: StampData) => {
    e.stopPropagation()
    if (justDraggedRef.current) {
      justDraggedRef.current = false
      return
    }
    onMemoClick(pageNum, memo, e.clientX, e.clientY)
  }

  return (
    <div className="flex justify-center mb-8" id={`page-${pageNum}`}>
      <div
        ref={containerRef}
        className="relative shadow-2xl bg-gray-200"
        style={{ width: pageW, height: pageH }}
      >
        <canvas ref={canvasRef} className="block" />

        {/* クリックオーバーレイ: memoMode時にクリックでテキスト追加 */}
        <div
          className={`absolute inset-0 ${memoMode ? 'cursor-crosshair' : 'cursor-default'}`}
          onClick={handleOverlayClick}
        >
          {/* 既存テキストメモ */}
          {memos.map((memo) => (
            <div
              key={memo.id}
              className="absolute whitespace-nowrap select-none"
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
                cursor: 'grab',
                touchAction: 'none',
                userSelect: 'none',
                zIndex: 10,
              }}
              onPointerDown={(e) => handleMemoPointerDown(e, memo)}
              onClick={(e) => handleMemoClick(e, memo)}
              title="ドラッグで移動 / クリックで編集・削除"
            >
              {memo.text}
            </div>
          ))}

          {/* 追加ポップアップ表示中のページ: うっすら強調 */}
          {isPendingPage && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'rgba(59,130,246,0.04)', outline: '2px solid rgba(59,130,246,0.3)' }}
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
// MemoPopup: テキスト新規追加ポップアップ
// ============================================================

interface MemoPopupProps {
  pending: PendingMemo
  onAdd: (stamp: StampData) => void
  onCancel: () => void
}

const MemoPopup: React.FC<MemoPopupProps> = ({ pending, onAdd, onCancel }) => {
  const [text, setText] = useState('')
  const [fontSize, setFontSize] = useState(MEMO_SIZE_DEFAULT)
  const [color, setColor] = useState('#000000')
  const [bold, setBold] = useState(false)

  const decFontSize = () => setFontSize((p) => Math.max(MEMO_SIZE_MIN, p - MEMO_SIZE_STEP))
  const incFontSize = () => setFontSize((p) => Math.min(MEMO_SIZE_MAX, p + MEMO_SIZE_STEP))

  const popupW = 280
  const popupH = 340
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
      className="fixed z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl"
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

      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-gray-400">サイズ</span>
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 px-1 py-0.5">
          <button
            onClick={decFontSize}
            disabled={fontSize <= MEMO_SIZE_MIN}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-base font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            title="文字を小さく"
          >−</button>
          <span className="min-w-[44px] text-center text-xs text-gray-600 tabular-nums">{fontSize}px</span>
          <button
            onClick={incFontSize}
            disabled={fontSize >= MEMO_SIZE_MAX}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-base font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            title="文字を大きく"
          >＋</button>
        </div>
        <label className="ml-auto flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
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
        <div className="mb-2 rounded bg-gray-50 px-2 py-1 text-center overflow-hidden">
          <span style={{ fontSize: Math.min(fontSize * 0.7, 28), color, fontWeight: bold ? 'bold' : 'normal' }}>{text}</span>
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
// EditMemoPopup: 既存テキスト編集ポップアップ
// ============================================================

interface EditMemoPopupProps {
  editing: EditingMemo
  onUpdate: (updates: Partial<Omit<StampData, 'id'>>) => void
  onDelete: () => void
  onClose: () => void
}

const EditMemoPopup: React.FC<EditMemoPopupProps> = ({ editing, onUpdate, onDelete, onClose }) => {
  const [text, setText] = useState(editing.memo.text)
  const [fontSize, setFontSize] = useState(editing.memo.fontSize)
  const [color, setColor] = useState(editing.memo.color)
  const [bold, setBold] = useState(editing.memo.bold)

  const decFontSize = () => setFontSize((p) => Math.max(MEMO_SIZE_MIN, p - MEMO_SIZE_STEP))
  const incFontSize = () => setFontSize((p) => Math.min(MEMO_SIZE_MAX, p + MEMO_SIZE_STEP))

  const popupW = 280
  const popupH = 380
  const left = Math.min(editing.screenX + 12, window.innerWidth - popupW - 16)
  const top = Math.min(Math.max(editing.screenY - 20, 8), window.innerHeight - popupH - 8)

  const handleUpdate = () => {
    if (!text.trim()) return
    onUpdate({ text: text.trim(), fontSize, color, bold })
    onClose()
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  return (
    <div
      className="fixed z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">テキストを編集</span>
        <button onClick={onClose} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

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
          if (e.key === 'Enter') handleUpdate()
          if (e.key === 'Escape') onClose()
        }}
        placeholder="テキストを入力..."
        className="mb-2 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
      />

      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-gray-400">サイズ</span>
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 px-1 py-0.5">
          <button
            onClick={decFontSize}
            disabled={fontSize <= MEMO_SIZE_MIN}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-base font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            title="文字を小さく"
          >−</button>
          <span className="min-w-[44px] text-center text-xs text-gray-600 tabular-nums">{fontSize}px</span>
          <button
            onClick={incFontSize}
            disabled={fontSize >= MEMO_SIZE_MAX}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-base font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            title="文字を大きく"
          >＋</button>
        </div>
        <label className="ml-auto flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
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
        <div className="mb-2 rounded bg-gray-50 px-2 py-1 text-center overflow-hidden">
          <span style={{ fontSize: Math.min(fontSize * 0.7, 28), color, fontWeight: bold ? 'bold' : 'normal' }}>{text}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          title="このテキストを削除"
        >
          削除
        </button>
        <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
          キャンセル
        </button>
        <button
          onClick={handleUpdate}
          disabled={!text.trim()}
          className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-blue-700"
        >
          更新
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
    rotations,
    stamps,
    addStamp,
    updateStamp,
    removeStamp,
    rotatePage,
    setAppView,
    setFileName,
    previewPageNum,
    undo,
    redo,
    undoStack,
    redoStack,
  } = usePdfStore()

  const [scale, setScale] = useState(DEFAULT_SCALE)

  // テキスト追加モード
  const [memoMode, setMemoMode] = useState(false)

  // テキストポップアップ状態
  const [pendingMemo, setPendingMemo] = useState<PendingMemo | null>(null)
  const [editingMemo, setEditingMemo] = useState<EditingMemo | null>(null)

  // 現在ページ
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

  // 初期スクロール位置
  useEffect(() => {
    if (previewPageNum <= 1) return
    const container = scrollContainerRef.current
    if (!container) return
    const estimatedH = Math.round(595 * scale * A4_RATIO) + 32
    container.scrollTop = (previewPageNum - 1) * estimatedH
    setCurrentPage(previewPageNum)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // スクロールでページ番号を推定
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const estimatedH = Math.round(595 * scale * A4_RATIO) + 32
    const estimated = Math.max(1, Math.ceil((container.scrollTop + 32) / estimatedH))
    setCurrentPage(Math.min(estimated, pageCount))
    setShowPageIndicator(true)
    if (indicatorTimerRef.current) clearTimeout(indicatorTimerRef.current)
    indicatorTimerRef.current = setTimeout(() => setShowPageIndicator(false), 2500)
  }, [pageCount, scale])

  // サイドバー: 現在ページをスクロール
  useEffect(() => {
    const el = document.getElementById(`sidebar-thumb-${currentPage}`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentPage])

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
      const meta = e.ctrlKey || e.metaKey
      // テキスト入力中はブラウザ標準のショートカットを優先（Undo/Redo の横取り防止）
      const target = e.target as HTMLElement | null
      const isEditableField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          (target as HTMLElement).isContentEditable)

      if (meta) {
        // ズーム
        if (e.key === '+' || e.key === '=') { e.preventDefault(); setScale((p) => Math.min(MAX_SCALE, Math.round((p + SCALE_STEP) * 10) / 10)); return }
        if (e.key === '-') { e.preventDefault(); setScale((p) => Math.max(MIN_SCALE, Math.round((p - SCALE_STEP) * 10) / 10)); return }
        if (e.key === '0') { e.preventDefault(); setScale(DEFAULT_SCALE); return }
        // Undo / Redo（入力欄では発火させない）
        if (!isEditableField) {
          if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
          if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo(); return }
        }
        return
      }
      if (e.key === 'Escape') {
        if (editingMemo) setEditingMemo(null)
        else if (pendingMemo) setPendingMemo(null)
        else if (memoMode) { setMemoMode(false); setPendingMemo(null) }
        else if (isEditingName) setIsEditingName(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingMemo, pendingMemo, memoMode, isEditingName, undo, redo])

  // ページ空白クリック → 新規テキスト追加
  const handlePageClick = useCallback(
    (pageNum: number, relX: number, relY: number, screenX: number, screenY: number) => {
      setEditingMemo(null)
      setPendingMemo({ pageNum, relX, relY, screenX, screenY })
    },
    [],
  )

  // 既存テキストクリック → 編集ポップアップ
  const handleMemoClick = useCallback(
    (pageNum: number, memo: StampData, screenX: number, screenY: number) => {
      setPendingMemo(null)
      setEditingMemo({ pageNum, memo, screenX, screenY })
    },
    [],
  )

  const handleAddMemo = useCallback(
    (stamp: StampData) => {
      if (!pendingMemo) return
      addStamp(pendingMemo.pageNum, stamp)
      setPendingMemo(null)
    },
    [pendingMemo, addStamp],
  )

  const handleUpdateMemo = useCallback(
    (updates: Partial<Omit<StampData, 'id'>>) => {
      if (!editingMemo) return
      updateStamp(editingMemo.pageNum, editingMemo.memo.id, updates)
    },
    [editingMemo, updateStamp],
  )

  const handleDeleteMemo = useCallback(() => {
    if (!editingMemo) return
    removeStamp(editingMemo.pageNum, editingMemo.memo.id)
  }, [editingMemo, removeStamp])

  // PDF保存
  const handleSave = async () => {
    const { pdfArrayBuffer: buf, stamps: allStamps, rotations: allRotations } = usePdfStore.getState()
    if (!buf) {
      alert('PDFが読み込まれていません')
      return
    }
    setIsSaving(true)
    setSaveProgress(0)
    try {
      const bytes = await buildPdfAllPages(buf, allRotations, allStamps, (current, total) => {
        setSaveProgress(Math.round((current / total) * 100))
      })
      const hasAnyEdits = allStamps.some((s) => s.length > 0) || allRotations.some((r) => r !== 0)
      const suffix = hasAnyEdits ? '_編集済' : ''
      const outName = fileName.replace(/\.pdf$/i, '') + suffix + '.pdf'
      await saveFile(bytes, outName)
    } catch (err) {
      alert(`保存エラー: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSaving(false)
      setSaveProgress(0)
    }
  }

  // 印刷
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
    if (newName) setFileName(newName.endsWith('.pdf') ? newName : `${newName}.pdf`)
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

        {/* 別のPDF（新規タブ） */}
        <button
          onClick={() => {
            const baseUrl = window.location.origin + window.location.pathname
            window.open(`${baseUrl}?new=1`, '_blank')
          }}
          className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          title="別のPDFを新しいタブで開く"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          別のPDF
        </button>

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 px-1 py-0.5">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            title="元に戻す (Ctrl+Z)"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H6m-3-10l4-4m-4 4l4 4" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            title="やり直し (Ctrl+Y)"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h7m3-10l-4-4m4 4l-4 4" />
            </svg>
          </button>
        </div>

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
            title="クリックでリセット"
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

        {/* テキスト件数バッジ */}
        {totalMemos > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 flex-shrink-0">
            ✏ {totalMemos}件
          </span>
        )}

        {/* 印刷 */}
        <button
          onClick={handlePrint}
          className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0"
          title="新しいタブで開いて印刷"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          印刷
        </button>

        {/* 保存 */}
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

      {/* ===== メインエリア ===== */}
      <div className="flex flex-1 overflow-hidden">

        {/* 左サイドバー */}
        <div
          className="w-[76px] flex-shrink-0 overflow-y-auto bg-gray-800 py-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
            const rot = rotations[n - 1] ?? 0
            return (
              <div
                key={n}
                id={`sidebar-thumb-${n}`}
                className={`group relative mx-1.5 mb-1.5 cursor-pointer rounded overflow-hidden transition-all ${
                  n === currentPage ? 'ring-2 ring-blue-400 opacity-100' : 'opacity-50 hover:opacity-80'
                }`}
                onClick={() => scrollToPage(n)}
                title={`${n}ページ目へ（右上のボタンで回転）`}
              >
                {/* 回転ボタン（ホバー時に右上に表示） */}
                <button
                  onClick={(e) => { e.stopPropagation(); rotatePage(n) }}
                  className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
                  title={`${n}ページ目を右に90度回転`}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                {thumbnails[n - 1] ? (
                  <div className="w-full flex items-center justify-center bg-gray-700/30" style={{ aspectRatio: '1/1.414', overflow: 'hidden' }}>
                    <img
                      src={thumbnails[n - 1]}
                      className="block"
                      draggable={false}
                      alt={`${n}p`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        transform: rot ? `rotate(${rot}deg)` : undefined,
                        scale: rot === 90 || rot === 270 ? '0.7' : undefined,
                        transition: 'transform 0.2s, scale 0.2s',
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-full bg-gray-700" style={{ aspectRatio: '1/1.414' }} />
                )}
                <div className="text-center py-0.5 truncate px-0.5 font-medium"
                  style={{ color: n === currentPage ? '#93c5fd' : '#6b7280', fontSize: 10 }}>
                  {n}
                </div>
              </div>
            )
          })}
        </div>

        {/* メインスクロールエリア */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto py-8 px-4"
          onScroll={handleScroll}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPendingMemo(null)
              setEditingMemo(null)
            }
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
              onMemoClick={handleMemoClick}
            />
          ))}
        </div>
      </div>

      {/* ===== 右下: テキスト追加ボタン + ページ番号インジケーター ===== */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {/* memoMode中: 操作ヒント */}
        {memoMode && (
          <div className="pointer-events-none rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white/80 select-none text-right leading-relaxed">
            追記したい箇所をクリック<br />
            <span className="text-white/50">既存テキスト: ドラッグで移動 / クリックで編集</span>
          </div>
        )}

        {/* テキスト追加トグルボタン */}
        <button
          onClick={() => { setMemoMode((m) => !m); setPendingMemo(null) }}
          className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition-all duration-200 ${
            memoMode
              ? 'bg-amber-500 text-white hover:bg-amber-600 ring-2 ring-amber-300 ring-offset-1'
              : 'bg-white/90 text-gray-700 hover:bg-white border border-gray-300'
          }`}
          title={memoMode ? 'テキスト追加モードを終了 (Esc)' : 'テキスト追加モードを開始'}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          {memoMode ? 'テキスト追加中...' : 'テキストを追加'}
        </button>

        {/* 現在ページ（スクロール中のみ） */}
        <div
          className={`pointer-events-none rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white tabular-nums shadow-lg transition-all duration-300 ${
            showPageIndicator ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          {currentPage} / {pageCount}
        </div>
      </div>

      {/* ===== テキスト追加ポップアップ ===== */}
      {pendingMemo && (
        <MemoPopup
          pending={pendingMemo}
          onAdd={handleAddMemo}
          onCancel={() => setPendingMemo(null)}
        />
      )}

      {/* ===== テキスト編集ポップアップ ===== */}
      {editingMemo && (
        <EditMemoPopup
          editing={editingMemo}
          onUpdate={handleUpdateMemo}
          onDelete={handleDeleteMemo}
          onClose={() => setEditingMemo(null)}
        />
      )}
    </div>
  )
}
