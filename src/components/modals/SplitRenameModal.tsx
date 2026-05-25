import React, { useState } from 'react'
import { usePdfStore } from '../../stores/usePdfStore'
import { extractPages } from '../../lib/pdfEditor'
import { saveFile } from '../../lib/fsAccess'

interface Segment {
  start: number
  end: number
}

interface SplitRenameModalProps {
  segments: Segment[]
  onClose: () => void
  onDone: () => void
}

/**
 * 分割ファイルのリネームモーダル
 * 各セグメントの表紙サムネイルを見ながらファイル名を設定して保存する
 */
export const SplitRenameModal: React.FC<SplitRenameModalProps> = ({ segments, onClose, onDone }) => {
  const { thumbnails, fileName, pdfArrayBuffer, rotations } = usePdfStore()
  const setSplitMode = usePdfStore((s) => s.setSplitMode)
  const clearSplitCutPoints = usePdfStore((s) => s.clearSplitCutPoints)

  const baseName = fileName.replace(/\.pdf$/i, '')

  // 各セグメントのファイル名（初期値: baseName_001.pdf など）
  const [fileNames, setFileNames] = useState<string[]>(
    segments.map((_, i) => `${baseName}_${String(i + 1).padStart(3, '0')}.pdf`),
  )

  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)

  const updateFileName = (index: number, value: string) => {
    const next = [...fileNames]
    next[index] = value
    setFileNames(next)
  }

  const handleSave = async () => {
    if (!pdfArrayBuffer) return
    setIsProcessing(true)
    setProgress(0)

    try {
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        const pages = Array.from(
          { length: seg.end - seg.start + 1 },
          (_, j) => seg.start + j,
        )
        const bytes = await extractPages(pdfArrayBuffer, pages, rotations)
        const name = fileNames[i]?.trim() || `${baseName}_${String(i + 1).padStart(3, '0')}.pdf`
        const outName = name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
        await saveFile(bytes, outName)
        setProgress(i + 1)
        await new Promise((r) => setTimeout(r, 300))
      }

      setSplitMode(false)
      clearSplitCutPoints()
      onDone()
      alert(`✅ ${segments.length}個のPDFに分割しました`)
    } catch (err) {
      alert(`分割エラー: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ maxHeight: '90vh' }}>

        {/* ヘッダー */}
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            ✂ 分割ファイルのファイル名を設定
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            表紙を確認しながらファイル名を入力してください。「.pdf」は自動で付加されます。
          </p>
        </div>

        {/* セグメント一覧 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {segments.map((seg, i) => {
            const thumbSrc = thumbnails[seg.start - 1]
            return (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:border-gray-300 transition-colors">
                {/* 表紙サムネイル */}
                <div className="flex-shrink-0 w-14 flex flex-col items-center gap-0.5">
                  {thumbSrc ? (
                    <img
                      src={thumbSrc}
                      className="w-full rounded border border-gray-100 shadow-sm"
                      alt={`${seg.start}ページ目`}
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full rounded bg-gray-200" style={{ aspectRatio: '1/1.414' }} />
                  )}
                  <span className="text-xs text-gray-400">表紙</span>
                </div>

                {/* ページ情報 */}
                <div className="flex-shrink-0 w-20">
                  <div className="font-mono text-xs font-bold text-gray-300 mb-0.5">
                    {String(i + 1).padStart(3, '0')}
                  </div>
                  <div className="text-xs text-gray-600">
                    p{seg.start}〜p{seg.end}
                  </div>
                  <div className="text-xs text-gray-400">
                    {seg.end - seg.start + 1}ページ
                  </div>
                </div>

                {/* ファイル名入力 */}
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={fileNames[i]}
                      onChange={(e) => updateFileName(i, e.target.value)}
                      disabled={isProcessing}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 disabled:opacity-50"
                      placeholder={`${baseName}_${String(i + 1).padStart(3, '0')}.pdf`}
                    />
                  </div>
                  {fileNames[i] && !fileNames[i].toLowerCase().endsWith('.pdf') && (
                    <p className="mt-0.5 text-xs text-blue-500">→ {fileNames[i]}.pdf として保存</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* フッター */}
        <div className="border-t border-gray-100 px-5 py-4">
          {isProcessing && (
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-gray-500">
                <span>保存中...</span>
                <span>{progress} / {segments.length} ファイル</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${Math.round((progress / segments.length) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              ← 戻って分割点を修正
            </button>
            <div className="flex-1" />
            <button
              onClick={handleSave}
              disabled={isProcessing}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isProcessing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  保存中...
                </>
              ) : (
                `✂ ${segments.length}個に分割して保存`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
