import { usePdfStore, THUMBNAIL_SIZES } from '../stores/usePdfStore'
import { ThumbnailCard } from './ThumbnailCard'

export const ThumbnailGrid = () => {
  const pageCount = usePdfStore((s) => s.pageCount)
  const sizeLevel = usePdfStore((s) => s.thumbnailSizeLevel)
  const loadProgress = usePdfStore((s) => s.loadProgress)

  const size = THUMBNAIL_SIZES[sizeLevel]

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
      {/* 読み込み中プログレスバー */}
      {loadProgress > 0 && loadProgress < 100 && (
        <div className="mb-3 overflow-hidden rounded-full bg-blue-100" style={{ height: 4 }}>
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      )}

      {/* サムネイルグリッド */}
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
    </div>
  )
}
