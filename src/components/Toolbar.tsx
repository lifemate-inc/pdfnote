import { usePdfStore, THUMBNAIL_LABELS, THUMBNAIL_SIZES, ThumbnailSizeLevel } from '../stores/usePdfStore'

const MIN_THUMB_LEVEL: ThumbnailSizeLevel = 1
const MAX_THUMB_LEVEL: ThumbnailSizeLevel = 6

interface ToolbarProps {
  onExtract: () => void
  onNewFile: () => void
}

export const Toolbar = ({ onExtract, onNewFile }: ToolbarProps) => {
  const fileName = usePdfStore((s) => s.fileName)
  const pageCount = usePdfStore((s) => s.pageCount)
  const selectedPages = usePdfStore((s) => s.selectedPages)
  const sizeLevel = usePdfStore((s) => s.thumbnailSizeLevel)
  const splitMode = usePdfStore((s) => s.splitMode)
  const selectAll = usePdfStore((s) => s.selectAll)
  const clearSelection = usePdfStore((s) => s.clearSelection)
  const setThumbnailSizeLevel = usePdfStore((s) => s.setThumbnailSizeLevel)
  const setAppView = usePdfStore((s) => s.setAppView)
  const setSplitMode = usePdfStore((s) => s.setSplitMode)
  const clearSplitCutPoints = usePdfStore((s) => s.clearSplitCutPoints)

  const selectedCount = selectedPages.size
  const allSelected = selectedCount === pageCount && pageCount > 0

  const decSize = () =>
    setThumbnailSizeLevel(Math.max(MIN_THUMB_LEVEL, sizeLevel - 1) as ThumbnailSizeLevel)
  const incSize = () =>
    setThumbnailSizeLevel(Math.min(MAX_THUMB_LEVEL, sizeLevel + 1) as ThumbnailSizeLevel)

  const handleToggleSplitMode = () => {
    if (splitMode) {
      // 分割モードを終了（分割点はそのまま残す）
      setSplitMode(false)
    } else {
      setSplitMode(true)
    }
  }

  const handleExitSplitMode = () => {
    setSplitMode(false)
    clearSplitCutPoints()
  }

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2 shadow-sm flex-wrap">

      {/* ← 閲覧に戻る */}
      <button
        onClick={() => setAppView('viewer')}
        className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-shrink-0"
        title="縦スクロール閲覧画面に戻る"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        閲覧に戻る
      </button>

      <div className="h-5 w-px bg-gray-200" />

      {/* ファイル名 */}
      <div className="flex items-center gap-2 min-w-0 mr-1">
        <svg className="h-4 w-4 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="truncate text-sm font-medium text-gray-700 max-w-[180px]" title={fileName}>
          {fileName}
        </span>
        <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
          {pageCount}p
        </span>
      </div>

      <div className="h-5 w-px bg-gray-200" />

      {/* 分割モード中は選択操作を非表示 */}
      {!splitMode && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={allSelected ? clearSelection : selectAll}
            className="rounded px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            {allSelected ? '全解除' : '全選択'}
          </button>
          {selectedCount > 0 && (
            <>
              <button
                onClick={clearSelection}
                className="rounded px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              >
                解除
              </button>
              <span className="text-xs font-semibold text-blue-600">
                {selectedCount}p選択
              </span>
            </>
          )}
        </div>
      )}

      {/* 分割モード中のラベル */}
      {splitMode && (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
            ✂ 分割点設定中
          </span>
          <button
            onClick={handleExitSplitMode}
            className="rounded px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
          >
            キャンセル
          </button>
        </div>
      )}

      <div className="flex-1" />

      {/* サムネイルサイズ（分割モード中も表示） */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">サイズ</span>
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 px-1 py-0.5">
          <button
            onClick={decSize}
            disabled={sizeLevel <= MIN_THUMB_LEVEL}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-base font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            title="サムネを小さく"
          >−</button>
          <span className="min-w-[36px] text-center text-xs text-gray-600 tabular-nums" title={`${THUMBNAIL_SIZES[sizeLevel]}px`}>
            {THUMBNAIL_LABELS[sizeLevel]}
          </span>
          <button
            onClick={incSize}
            disabled={sizeLevel >= MAX_THUMB_LEVEL}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-base font-bold disabled:opacity-30 disabled:cursor-not-allowed"
            title="サムネを大きく"
          >＋</button>
        </div>
      </div>

      <div className="h-5 w-px bg-gray-200" />

      {/* 一括分割ボタン */}
      <button
        onClick={handleToggleSplitMode}
        className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
          splitMode
            ? 'bg-orange-500 text-white hover:bg-orange-600'
            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
        title="分割点を設定して複数のPDFに分割"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
        </svg>
        {splitMode ? '分割モード終了' : '✂ 分割'}
      </button>

      {/* 選択ページを抽出（分割モード中は非表示） */}
      {!splitMode && (
        <button
          onClick={onExtract}
          disabled={selectedCount === 0}
          className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
            selectedCount > 0
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              : 'cursor-not-allowed bg-gray-100 text-gray-400'
          }`}
          title={selectedCount === 0 ? 'ページを選択してから抽出できます' : `${selectedCount}ページを抽出して保存`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2" />
          </svg>
          抽出{selectedCount > 0 ? `（${selectedCount}p）` : ''}
        </button>
      )}

      {/* 別のPDF（新規タブで開く） */}
      <button
        onClick={onNewFile}
        className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        title="別のPDFを新しいタブで開く"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        別のPDF
      </button>
    </div>
  )
}
