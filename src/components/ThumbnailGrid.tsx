import React from 'react'
import { usePdfStore, THUMBNAIL_SIZES } from '../stores/usePdfStore'
import { ThumbnailCard } from './ThumbnailCard'

// ============================================================
// 分割モード用: ページ間クリックで分割点を設定するリストビュー
// ============================================================

const SplitModeList: React.FC = () => {
  const pageCount = usePdfStore((s) => s.pageCount)
  const thumbnails = usePdfStore((s) => s.thumbnails)
  const rotations = usePdfStore((s) => s.rotations)
  const splitCutPoints = usePdfStore((s) => s.splitCutPoints)
  const toggleSplitCutPoint = usePdfStore((s) => s.toggleSplitCutPoint)
  const rotatePage = usePdfStore((s) => s.rotatePage)
  const stamps = usePdfStore((s) => s.stamps)
  const setPreviewPageNum = usePdfStore((s) => s.setPreviewPageNum)
  const setAppView = usePdfStore((s) => s.setAppView)

  // どのセグメントに属するか（分割点から計算）
  const getSegmentIndex = (pageNum: number): number => {
    const sorted = [...splitCutPoints].sort((a, b) => a - b)
    let idx = 0
    for (const cp of sorted) {
      if (pageNum > cp) idx++
      else break
    }
    return idx
  }

  // セグメントの色（最大10色でサイクル）
  const SEGMENT_COLORS = [
    'border-blue-400 bg-blue-50',
    'border-emerald-400 bg-emerald-50',
    'border-violet-400 bg-violet-50',
    'border-orange-400 bg-orange-50',
    'border-rose-400 bg-rose-50',
    'border-cyan-400 bg-cyan-50',
    'border-yellow-400 bg-yellow-50',
    'border-pink-400 bg-pink-50',
    'border-teal-400 bg-teal-50',
    'border-indigo-400 bg-indigo-50',
  ]
  const SEGMENT_BADGES = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-orange-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-yellow-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
  ]

  const rotation = (pageNum: number) => rotations[pageNum - 1] ?? 0
  const hasMemo = (pageNum: number) => (stamps[pageNum - 1] ?? []).length > 0

  return (
    <div className="max-w-2xl mx-auto">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => {
        const isCut = splitCutPoints.has(pageNum)
        const isLast = pageNum === pageCount
        const segIdx = getSegmentIndex(pageNum)
        const colorClass = SEGMENT_COLORS[segIdx % SEGMENT_COLORS.length]
        const badgeClass = SEGMENT_BADGES[segIdx % SEGMENT_BADGES.length]

        return (
          <React.Fragment key={pageNum}>
            {/* ページ行 */}
            <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border-l-4 mb-1 ${colorClass}`}>
              {/* セグメント番号バッジ */}
              <div className={`flex-shrink-0 w-6 h-6 rounded-full ${badgeClass} flex items-center justify-center`}>
                <span className="text-xs font-bold text-white">{segIdx + 1}</span>
              </div>

              {/* サムネイル */}
              <div className="relative flex-shrink-0">
                {thumbnails[pageNum - 1] ? (
                  <img
                    src={thumbnails[pageNum - 1]}
                    className="h-20 rounded border border-gray-200 shadow-sm cursor-pointer hover:opacity-80 transition-opacity"
                    alt={`${pageNum}p`}
                    draggable={false}
                    style={{
                      transform: rotation(pageNum) ? `rotate(${rotation(pageNum)}deg)` : undefined,
                      scale: rotation(pageNum) === 90 || rotation(pageNum) === 270 ? '0.7' : undefined,
                    }}
                    onDoubleClick={() => { setPreviewPageNum(pageNum); setAppView('viewer') }}
                    title="ダブルクリックで閲覧"
                  />
                ) : (
                  <div className="h-20 w-14 rounded border border-gray-200 bg-gray-100 flex items-center justify-center">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                  </div>
                )}
                {hasMemo(pageNum) && (
                  <div className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 text-xs font-bold text-white leading-4">✏</div>
                )}
              </div>

              {/* ページ情報 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-700">{pageNum}ページ</div>
                <div className="text-xs text-gray-400">グループ {segIdx + 1}</div>
              </div>

              {/* 回転ボタン */}
              <button
                onClick={() => rotatePage(pageNum)}
                className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                title="右に90度回転"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* 分割点ゾーン（最終ページ以外） */}
            {!isLast && (
              <div
                className={`group flex items-center gap-2 mx-4 cursor-pointer py-2 px-3 rounded-lg transition-all ${
                  isCut
                    ? 'bg-red-50 hover:bg-red-100'
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => toggleSplitCutPoint(pageNum)}
                title={isCut ? 'クリックで分割点を解除' : `${pageNum}ページと${pageNum + 1}ページの間で分割`}
              >
                <div className={`flex-1 border-t-2 transition-colors ${isCut ? 'border-dashed border-red-400' : 'border-gray-200 group-hover:border-gray-300'}`} />
                <span className={`flex-shrink-0 text-xs font-medium transition-colors ${isCut ? 'text-red-600' : 'text-gray-300 group-hover:text-gray-500'}`}>
                  {isCut ? '✂ ここで切る（クリックで解除）' : '＋ ここで切る'}
                </span>
                <div className={`flex-1 border-t-2 transition-colors ${isCut ? 'border-dashed border-red-400' : 'border-gray-200 group-hover:border-gray-300'}`} />
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ============================================================
// ThumbnailGrid: 通常モード / 分割モードで切り替え
// ============================================================

export const ThumbnailGrid = () => {
  const pageCount = usePdfStore((s) => s.pageCount)
  const sizeLevel = usePdfStore((s) => s.thumbnailSizeLevel)
  const loadProgress = usePdfStore((s) => s.loadProgress)
  const splitMode = usePdfStore((s) => s.splitMode)

  const size = THUMBNAIL_SIZES[sizeLevel]

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* 読み込み中プログレスバー */}
      {loadProgress > 0 && loadProgress < 100 && (
        <div className="mb-3 overflow-hidden rounded-full bg-blue-100" style={{ height: 4 }}>
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      )}

      {splitMode ? (
        /* 分割モード: ページ間クリック式リストビュー */
        <SplitModeList />
      ) : (
        /* 通常モード: グリッド表示 */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`,
            gap: 12,
            alignItems: 'start',
          }}
        >
          {Array.from({ length: pageCount }, (_, i) => (
            <ThumbnailCard key={i + 1} pageNum={i + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
