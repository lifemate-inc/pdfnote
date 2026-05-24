import { useMemo, useState } from 'react'
import { usePdfStore } from '../stores/usePdfStore'
import { Toolbar } from '../components/Toolbar'
import { ThumbnailGrid } from '../components/ThumbnailGrid'
import { ExtractModal } from '../components/modals/ExtractModal'
import { extractPages } from '../lib/pdfEditor'
import { saveFile } from '../lib/fsAccess'

export const ListPage = () => {
  const selectedPages = usePdfStore((s) => s.selectedPages)
  const status = usePdfStore((s) => s.status)
  const isLoading = usePdfStore((s) => s.isLoading)
  const reset = usePdfStore((s) => s.reset)
  const pageCount = usePdfStore((s) => s.pageCount)
  const fileName = usePdfStore((s) => s.fileName)
  const splitMode = usePdfStore((s) => s.splitMode)
  const splitCutPoints = usePdfStore((s) => s.splitCutPoints)
  const setSplitMode = usePdfStore((s) => s.setSplitMode)
  const clearSplitCutPoints = usePdfStore((s) => s.clearSplitCutPoints)

  const [showExtractModal, setShowExtractModal] = useState(false)
  const [isSplitting, setIsSplitting] = useState(false)
  const [splitProgress, setSplitProgress] = useState(0)

  const handleExtract = () => {
    if (selectedPages.size === 0) return
    setShowExtractModal(true)
  }

  const handleNewFile = () => {
    if (isLoading || window.confirm('現在のPDFを閉じて、新しいPDFを開きますか？')) {
      reset()
    }
  }

  // 分割点から各セグメント（{start, end}）を計算
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

  // 一括分割実行
  const handleBatchSplit = async () => {
    const { pdfArrayBuffer, rotations } = usePdfStore.getState()
    if (!pdfArrayBuffer || segments.length <= 1) return

    setIsSplitting(true)
    setSplitProgress(0)

    try {
      const baseName = fileName.replace(/\.pdf$/i, '')
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        const pages = Array.from(
          { length: seg.end - seg.start + 1 },
          (_, j) => seg.start + j,
        )
        const bytes = await extractPages(pdfArrayBuffer, pages, rotations)
        const name = `${baseName}_${String(i + 1).padStart(3, '0')}.pdf`
        await saveFile(bytes, name)
        setSplitProgress(i + 1)
        // ダイアログが連続で開かないよう少し待つ
        await new Promise((r) => setTimeout(r, 300))
      }
      setSplitMode(false)
      clearSplitCutPoints()
      alert(`✅ ${segments.length}個のPDFに分割しました`)
    } catch (err) {
      alert(`分割エラー: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSplitting(false)
      setSplitProgress(0)
    }
  }

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
            ヒント: サムネイルをクリックで選択 / ダブルクリックで閲覧・メモ
          </span>
        )}
        {splitMode && splitCutPoints.size === 0 && (
          <span className="ml-2 text-orange-400">
            ✂ サムネイル下の「ここで切る」をクリックして分割点を設定してください
          </span>
        )}
      </div>

      {/* ===== 一括分割フローティングパネル ===== */}
      {splitMode && (
        <div className="fixed bottom-8 right-8 z-50 rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-gray-800">
                ✂ 一括分割
              </span>
              {splitCutPoints.size > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                  {splitCutPoints.size}箇所設定済 → {segments.length}個のPDF
                </span>
              )}
            </div>

            {/* セグメントプレビュー（最大5件表示） */}
            {splitCutPoints.size > 0 && (
              <div className="mb-3 space-y-1 max-h-36 overflow-y-auto">
                {segments.slice(0, 5).map((seg, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                    <span className="font-mono text-gray-400 mr-2">{String(i + 1).padStart(3, '0')}</span>
                    <span className="flex-1">p{seg.start}〜p{seg.end}</span>
                    <span className="text-gray-400">{seg.end - seg.start + 1}ページ</span>
                  </div>
                ))}
                {segments.length > 5 && (
                  <div className="text-xs text-gray-400 text-center py-0.5">
                    他 {segments.length - 5} 個...
                  </div>
                )}
              </div>
            )}

            {/* 進行状況 */}
            {isSplitting && (
              <div className="mb-2 text-xs text-center text-gray-500">
                処理中: {splitProgress} / {segments.length} ファイル
              </div>
            )}
          </div>

          {/* ボタン */}
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={() => {
                setSplitMode(false)
                clearSplitCutPoints()
              }}
              disabled={isSplitting}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleBatchSplit}
              disabled={segments.length <= 1 || isSplitting}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors shadow-sm"
            >
              {isSplitting ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  処理中...
                </span>
              ) : (
                splitCutPoints.size > 0
                  ? `✂ ${segments.length}個に分割`
                  : '分割点を設定'
              )}
            </button>
          </div>
        </div>
      )}

      {showExtractModal && (
        <ExtractModal onClose={() => setShowExtractModal(false)} />
      )}
    </div>
  )
}
