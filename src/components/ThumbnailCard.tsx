import React, { useMemo } from 'react'
import { usePdfStore, THUMBNAIL_SIZES } from '../stores/usePdfStore'

// ============================================================
// セグメントカラー（分割モードのグループ識別用）
// ============================================================

const SEGMENT_BORDER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f97316', // orange
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
]

const SEGMENT_BG_COLORS = [
  'rgba(59,130,246,0.08)',
  'rgba(16,185,129,0.08)',
  'rgba(139,92,246,0.08)',
  'rgba(249,115,22,0.08)',
  'rgba(244,63,94,0.08)',
  'rgba(6,182,212,0.08)',
  'rgba(234,179,8,0.08)',
  'rgba(236,72,153,0.08)',
  'rgba(20,184,166,0.08)',
  'rgba(99,102,241,0.08)',
]

// ============================================================
// ThumbnailCard
// ============================================================

interface ThumbnailCardProps {
  pageNum: number // 1-based
}

export const ThumbnailCard: React.FC<ThumbnailCardProps> = ({ pageNum }) => {
  const thumbnail = usePdfStore((s) => s.thumbnails[pageNum - 1])
  const rotation = usePdfStore((s) => s.rotations[pageNum - 1] ?? 0)
  const isSelected = usePdfStore((s) => s.selectedPages.has(pageNum))
  const hasMemo = usePdfStore((s) => (s.stamps[pageNum - 1] ?? []).length > 0)
  const sizeLevel = usePdfStore((s) => s.thumbnailSizeLevel)
  const splitMode = usePdfStore((s) => s.splitMode)
  const splitCutPoints = usePdfStore((s) => s.splitCutPoints)
  const togglePage = usePdfStore((s) => s.togglePage)
  const rotatePage = usePdfStore((s) => s.rotatePage)
  const setPreviewPageNum = usePdfStore((s) => s.setPreviewPageNum)
  const setAppView = usePdfStore((s) => s.setAppView)

  const size = THUMBNAIL_SIZES[sizeLevel]
  const labelFontSize = Math.max(10, Math.min(14, size / 16))

  // 分割モード: このページが属するセグメント番号を計算
  const segmentIndex = useMemo(() => {
    if (!splitMode) return 0
    const sorted = [...splitCutPoints].sort((a, b) => a - b)
    let idx = 0
    for (const cp of sorted) {
      if (pageNum > cp) idx++
      else break
    }
    return idx
  }, [splitMode, splitCutPoints, pageNum])

  const segBorderColor = splitMode ? SEGMENT_BORDER_COLORS[segmentIndex % SEGMENT_BORDER_COLORS.length] : undefined
  const segBgColor = splitMode ? SEGMENT_BG_COLORS[segmentIndex % SEGMENT_BG_COLORS.length] : undefined

  const handleClick = (e: React.MouseEvent) => {
    if (splitMode) return  // 分割モード中は選択無効
    togglePage(pageNum, e.shiftKey, e.ctrlKey || e.metaKey)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setPreviewPageNum(pageNum)
    setAppView('viewer')
  }

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation()
    rotatePage(pageNum)
  }

  const handleOpenViewer = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreviewPageNum(pageNum)
    setAppView('viewer')
  }

  return (
    <div
      className={`
        group relative cursor-pointer rounded-lg border-2 transition-all duration-150 select-none
        ${splitMode
          ? 'cursor-default'
          : isSelected
            ? 'border-blue-600 bg-blue-50 shadow-md ring-1 ring-blue-300'
            : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
        }
      `}
      style={{
        width: size,
        padding: 6,
        borderColor: splitMode ? segBorderColor : undefined,
        borderWidth: splitMode ? 2 : undefined,
        background: splitMode ? segBgColor : undefined,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      role={splitMode ? undefined : 'checkbox'}
      aria-checked={splitMode ? undefined : isSelected}
      aria-label={`${pageNum}ページ目${isSelected ? '（選択中）' : ''}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (!splitMode) {
          if (e.key === ' ') handleClick(e as unknown as React.MouseEvent)
        }
        if (e.key === 'Enter') handleDoubleClick(e as unknown as React.MouseEvent)
      }}
      title={splitMode ? `${pageNum}ページ目（グループ${segmentIndex + 1}）` : 'クリック: 選択 / ダブルクリック: 閲覧・テキスト追加'}
    >
      {/* 分割モード: グループ番号バッジ */}
      {splitMode && (
        <div
          className="absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full text-white text-xs font-bold shadow-sm"
          style={{ background: segBorderColor }}
        >
          {segmentIndex + 1}
        </div>
      )}

      {/* 通常モード: 選択チェックマーク */}
      {!splitMode && (
        <div
          className={`
            absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full
            transition-all duration-150
            ${isSelected
              ? 'bg-blue-600 opacity-100'
              : 'border border-gray-300 bg-white/80 opacity-0 group-hover:opacity-100'
            }
          `}
        >
          {isSelected && (
            <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      )}

      {/* メモ済みバッジ */}
      {hasMemo && (
        <div className="absolute left-2 top-8 z-10 rounded-full bg-amber-400 px-1 text-xs font-bold text-white leading-4">
          ✏
        </div>
      )}

      {/* 右上のアクションボタン群 */}
      <div className="absolute right-1.5 top-1.5 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* 回転ボタン */}
        <button
          className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white/90 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          onClick={handleRotate}
          title="右に90度回転"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
        {/* 閲覧ボタン */}
        <button
          className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white/90 text-gray-500 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300"
          onClick={handleOpenViewer}
          title="閲覧・テキスト追加"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </div>

      {/* サムネイル画像 */}
      <div
        className="overflow-hidden rounded bg-gray-100 flex items-center justify-center"
        style={{ width: size - 12, height: (size - 12) * 1.414 }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`${pageNum}ページ目`}
            draggable={false}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transform: rotation ? `rotate(${rotation}deg)` : undefined,
              scale: rotation === 90 || rotation === 270 ? '0.7' : undefined,
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <span className="text-xs text-gray-400">{pageNum}</span>
          </div>
        )}
      </div>

      {/* ページ番号（分割モード時は非表示） */}
      {!splitMode && (
        <div className="mt-1 text-center text-gray-500" style={{ fontSize: labelFontSize }}>
          {pageNum}
        </div>
      )}
    </div>
  )
}
