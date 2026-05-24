import React, { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../../stores/usePdfStore'
import { getCurrentPdf, renderPageToCanvas, extractTextCandidates } from '../../lib/pdfLoader'
import { extractPages } from '../../lib/pdfEditor'
import { saveFile, hasFsaSupport } from '../../lib/fsAccess'

interface ExtractModalProps {
  onClose: () => void
}

/**
 * 選択ページを抽出して保存するモーダル
 *
 * レイアウト:
 * - 左カラム（60%）: 選択ページのプレビュー（pdf.js でレンダリング）
 * - 右カラム（40%）: ファイル名入力 + 候補ボタン + 保存ボタン
 */
export const ExtractModal: React.FC<ExtractModalProps> = ({ onClose }) => {
  const selectedPages = usePdfStore((s) => s.selectedPages)
  const rotations = usePdfStore((s) => s.rotations)
  const pdfArrayBuffer = usePdfStore((s) => s.pdfArrayBuffer)
  const fileName = usePdfStore((s) => s.fileName)

  // 選択ページをソート（昇順）
  const sortedPages = [...selectedPages].sort((a, b) => a - b)

  // ファイル名入力
  const baseName = fileName.replace(/\.pdf$/i, '')
  const [outputName, setOutputName] = useState('')
  const [candidates, setCandidates] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedSuccess, setSavedSuccess] = useState(false)

  // プレビュー canvas の ref（ページ数分）
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>(
    new Array(sortedPages.length).fill(null),
  )

  // ============================================================
  // 初期化: テキスト候補の抽出
  // ============================================================
  useEffect(() => {
    const firstPage = sortedPages[0]
    if (!firstPage) return
    const pdf = getCurrentPdf()
    if (!pdf) return
    extractTextCandidates(pdf, firstPage).then(setCandidates)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================
  // プレビュー描画（モーダルが開いたタイミングで全ページをレンダリング）
  // ============================================================
  useEffect(() => {
    const pdf = getCurrentPdf()
    if (!pdf) return

    // 非同期でページを順番にレンダリング
    const renderAll = async () => {
      for (let i = 0; i < sortedPages.length; i++) {
        const canvas = canvasRefs.current[i]
        if (canvas) {
          await renderPageToCanvas(pdf, sortedPages[i], 0.8, canvas)
        }
      }
    }
    renderAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================
  // Escape キーで閉じる
  // ============================================================
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ============================================================
  // 保存処理
  // ============================================================
  const handleSave = async () => {
    const name = outputName.trim()
    if (!name) {
      setSaveError('ファイル名を入力してください')
      return
    }
    if (!pdfArrayBuffer) return

    setIsSaving(true)
    setSaveError('')
    try {
      const bytes = await extractPages(pdfArrayBuffer, sortedPages, rotations)
      const outFileName = name.endsWith('.pdf') ? name : `${name}.pdf`
      await saveFile(bytes, outFileName)
      setSavedSuccess(true)
      // 1 秒後に自動でモーダルを閉じる
      setTimeout(() => onClose(), 1000)
    } catch (err) {
      setSaveError(
        `保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleCandidateClick = (candidate: string) => {
    setOutputName(candidate)
  }

  // ============================================================
  // レンダリング
  // ============================================================
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        {/* ===== 左カラム: ページプレビュー ===== */}
        <div className="flex w-3/5 flex-col border-r border-gray-100">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {sortedPages.length}ページ選択中
            </span>
            <span className="text-sm text-gray-500">
              ページ {sortedPages.join(', ')}
            </span>
          </div>

          {/* ページプレビュー一覧 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sortedPages.map((pageNum, i) => (
              <div key={pageNum} className="flex flex-col items-center">
                <div className="text-xs text-gray-400 mb-1">{pageNum}ページ目</div>
                <canvas
                  ref={(el) => {
                    canvasRefs.current[i] = el
                  }}
                  className="max-w-full rounded border border-gray-200 shadow-sm"
                  style={{ maxHeight: 400, width: 'auto' }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ===== 右カラム: ファイル名入力 ===== */}
        <div className="flex w-2/5 flex-col">
          {/* ヘッダー */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              ✂️ 抽出して保存
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              aria-label="閉じる"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 入力エリア */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* ファイル名入力 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                保存ファイル名（.pdf は自動付与）
              </label>
              <input
                type="text"
                value={outputName}
                onChange={(e) => {
                  setOutputName(e.target.value)
                  setSaveError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder={`例: ${baseName}_抽出`}
                className={`
                  w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors
                  focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                  ${saveError ? 'border-red-400 bg-red-50' : 'border-gray-300'}
                `}
                autoFocus
              />
              {saveError && (
                <p className="mt-1 text-xs text-red-600">{saveError}</p>
              )}
            </div>

            {/* 候補ボタン（テキスト抽出結果） */}
            {candidates.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">
                  📄 PDFから読み取った候補
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleCandidateClick(c)}
                      className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 保存先の説明 */}
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500 space-y-1">
              {hasFsaSupport() ? (
                <>
                  <p className="font-medium text-gray-700">💾 保存先を選択できます</p>
                  <p>「保存」をクリックするとフォルダ選択ダイアログが開きます。</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-gray-700">📥 ダウンロードフォルダに保存されます</p>
                  <p>
                    このブラウザは保存先の指定に対応していません。
                    Chrome または Edge をお使いください。
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 保存ボタン */}
          <div className="border-t border-gray-100 p-5">
            {savedSuccess ? (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-green-100 py-3 text-sm font-semibold text-green-700">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                保存しました！
              </div>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving || !outputName.trim()}
                className={`
                  w-full rounded-lg py-3 text-sm font-semibold transition-all
                  ${
                    isSaving || !outputName.trim()
                      ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow'
                  }
                `}
              >
                {isSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    処理中...
                  </span>
                ) : (
                  `💾 保存（${sortedPages.length}ページ）`
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
