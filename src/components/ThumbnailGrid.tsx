import { usePdfStore, THUMBNAIL_SIZES } from '../stores/usePdfStore'
import { ThumbnailCard } from './ThumbnailCard'

// ============================================================
// ThumbnailGrid
// ============================================================

export const ThumbnailGrid = () => {
  const pageCount = usePdfStore((s) => s.pageCount)
  const sizeLevel = usePdfStore((s) => s.thumbnailSizeLevel)
  const loadProgress = usePdfStore((s) => s.loadProgress)
  const splitMode = usePdfStore((s) => s.splitMode)
  const splitCutPoints = usePdfStore((s) => s.splitCutPoints)
  const toggleSplitCutPoint = usePdfStore((s) => s.toggleSplitCutPoint)

  const size = THUMBNAIL_SIZES[sizeLevel]
  // カットゾーンの幅。gap=12の中央に配置するため、左6px右6px計12pxの幅で中央を合わせる
  const CUT_ZONE_W = 24  // gap12 より少し広く（クリックしやすく）
  const GAP = 12

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
        // ================================================================
        // 分割モード: flexbox（幅が正確に size になり、カットゾーンが中央に収まる）
        //   gap=12px のとき cut-zone を left:calc(100% - GAP/2 - CUT_ZONE_W/2) で中央に配置
        // ================================================================
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP, alignItems: 'flex-start' }}>
          {Array.from({ length: pageCount }, (_, i) => {
            const pageNum = i + 1
            const isLast = pageNum === pageCount
            const isCut = splitCutPoints.has(pageNum)

            return (
              // カードとカットゾーンを一体のflex itemとして扱う
              <div
                key={pageNum}
                style={{ position: 'relative', overflow: 'visible', flexShrink: 0 }}
              >
                <ThumbnailCard pageNum={pageNum} />

                {/* カットゾーン: カード右端から gap の中央に配置（常時表示） */}
                {!isLast && (
                  <div
                    className="absolute top-0 bottom-0 z-20 cursor-pointer"
                    // left: 100% = カード右端, - GAP/2 + CUT_ZONE_W/2 = ゾーン左端
                    // 中心 = カード右端 + GAP/2 = gap 中央 ✓
                    style={{
                      left: `calc(100% - ${CUT_ZONE_W / 2 - GAP / 2}px)`,
                      width: CUT_ZONE_W,
                    }}
                    onClick={(e) => { e.stopPropagation(); toggleSplitCutPoint(pageNum) }}
                    title={
                      isCut
                        ? `✂ クリックで解除（p${pageNum} と p${pageNum + 1} の間）`
                        : `p${pageNum} と p${pageNum + 1} の間で分割`
                    }
                  >
                    {/* 縦線（常時表示） */}
                    <div
                      className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full transition-all duration-150"
                      style={{
                        width: isCut ? 4 : 1,
                        background: isCut ? '#ef4444' : '#d1d5db',
                        boxShadow: isCut ? '0 0 8px rgba(239,68,68,0.5)' : 'none',
                      }}
                    />

                    {/* ハサミアイコン（中央・常時表示） */}
                    <div
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center transition-all duration-150"
                      style={{
                        width: isCut ? 28 : 20,
                        height: isCut ? 28 : 20,
                        background: isCut ? '#ef4444' : '#f3f4f6',
                        border: isCut ? 'none' : '1px solid #d1d5db',
                        boxShadow: isCut ? '0 2px 8px rgba(239,68,68,0.4)' : '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    >
                      <svg
                        fill="none"
                        stroke={isCut ? '#ffffff' : '#9ca3af'}
                        viewBox="0 0 24 24"
                        style={{ width: isCut ? 16 : 12, height: isCut ? 16 : 12 }}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        // ================================================================
        // 通常モード: CSS auto-fill グリッド
        // ================================================================
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`,
            gap: GAP,
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
