import { useMemo, useState } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { Toolbar } from '../components/Toolbar'
import { ThumbnailGrid } from '../components/ThumbnailGrid'
import { ExtractModal } from '../components/modals/ExtractModal'
import { SplitRenameModal } from '../components/modals/SplitRenameModal'

export const ListPage = () => {
  const selectedPages = usePdfStore((s) => s.selectedPages)
  const status = usePdfStore((s) => s.status)
  const isLoading = usePdfStore((s) => s.isLoading)
  const pageCount = usePdfStore((s) => s.pageCount)
  const splitMode = usePdfStore((s) => s.splitMode)
  const splitCutPoints = usePdfStore((s) => s.splitCutPoints)
  const setSplitMode = usePdfStore((s) => s.setSplitMode)
  const clearSplitCutPoints = usePdfStore((s) => s.clearSplitCutPoints)

  const [showExtractModal, setShowExtractModal] = useState(false)
  const [showSplitRenameModal, setShowSplitRenameModal] = useState(false)

  const handleExtract = () => {
    if (selectedPages.size === 0) return
    setShowExtractModal(true)
  }

  const handleNewFile = () => {
    // 新しいタブでアプリを開く（現在のタブのPDFはそのまま）
    // ?new=1 を付けて、新規タブでは復元プロンプトをスキップ
    const baseUrl = window.location.origin + window.location.pathname
    window.open(`${baseUrl}?new=1`, '_blank')
  }

  // 分割点からセグメントを計算
  const segments = useMemo(() => {
    const sorted = [...splitCutPoints].sort((a, b) => a - b)
    const segs: { start: number; end: number }[] = []
    let start = 1
    for (const cp of sorted) {
      if (cp >= start && cp < pageCount) {
        segs.push({ start, end: cp })
        start = cp + 1
      }
    }
    segs.push({ start, end: pageCount })
    return segs
  }, [splitCutPoints, pageCount])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Toolbar
        onExtract={handleExtract}
        onNewFile={handleNewFile}
      />

      <ThumbnailGrid />

      {/* ステータスバー */}
      <div className="border-t border-gray-100 bg-white px-4 py-1.5 text-xs text-gray-400">
        {status}
        {selectedPages.size === 0 && !isLoading && !splitMode && (
          <span className="ml-2 text-gray-300">
            ヒント: クリックで選択 / ダブルクリックで閲覧・テキスト追加
          </span>
        )}
        {splitMode && splitCutPoints.size === 0 && (
          <span className="ml-2 text-orange-400">
            ✂ ページとページの間にある「ここで切る」をクリックして分割点を設定してください
          </span>
        )}
      </div>

      {/* ===== 分割モード: フローティングパネル ===== */}
      {splitMode && (
        <div className="fixed bottom-8 right-8 z-50 rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden min-w-[240px]">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-gray-800">✂ 分割</span>
              {splitCutPoints.size > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                  {splitCutPoints.size}箇所 → {segments.length}個のPDF
                </span>
              )}
            </div>

            {/* セグメントプレビュー（最大4件） */}
            {splitCutPoints.size > 0 && (
              <div className="space-y-1 mb-1 max-h-32 overflow-y-auto">
                {segments.slice(0, 4).map((seg, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                    <span className="font-mono font-bold text-gray-400">{String(i + 1).padStart(3, '0')}</span>
                    <span className="flex-1">p{seg.start}〜p{seg.end}</span>
                    <span className="text-gray-400">{seg.end - seg.start + 1}p</span>
                  </div>
                ))}
                {segments.length > 4 && (
                  <div className="text-xs text-gray-400 text-center py-0.5">他 {segments.length - 4} 個...</div>
                )}
              </div>
            )}
          </div>

          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={() => { setSplitMode(false); clearSplitCutPoints() }}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={() => setShowSplitRenameModal(true)}
              disabled={segments.length <= 1}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 shadow-sm"
            >
              {splitCutPoints.size > 0 ? `次へ →` : '分割点を設定'}
            </button>
          </div>
        </div>
      )}

      {showExtractModal && (
        <ExtractModal onClose={() => setShowExtractModal(false)} />
      )}

      {showSplitRenameModal && (
        <SplitRenameModal
          segments={segments}
          onClose={() => setShowSplitRenameModal(false)}
          onDone={() => setShowSplitRenameModal(false)}
        />
      )}
    </div>
  )
}
