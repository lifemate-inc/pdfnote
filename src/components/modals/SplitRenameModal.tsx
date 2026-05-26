import React, { useEffect, useState } from 'react'
import { usePdfStore } from '../../stores/usePdfStore'
import { extractPages } from '../../lib/pdfEditor'
import {
  hasDirectoryPickerSupport,
  pickDirectory,
  saveFileToDirectory,
} from '../../lib/fsAccess'
import {
  getCurrentPdf,
  extractTextCandidates,
  extractNameCandidatesFromText,
  renderPageToCanvas,
} from '../../lib/pdfLoader'

interface Segment {
  start: number
  end: number
}

interface SplitRenameModalProps {
  segments: Segment[]
  onClose: () => void
  onDone: () => void
}

// セグメントカラー（グループ識別用）
const SEGMENT_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#f43f5e',
  '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#6366f1',
]

/**
 * 分割ファイルのリネームモーダル（ギャラリーレイアウト）
 * - 各セグメントの表紙から氏名候補を自動抽出（埋め込みテキスト → OCR の順）
 * - フォルダを1回指定して全PDFを一括保存
 */
export const SplitRenameModal: React.FC<SplitRenameModalProps> = ({ segments, onClose, onDone }) => {
  const { thumbnails, fileName, pdfArrayBuffer, rotations, stamps } = usePdfStore()
  const setSplitMode = usePdfStore((s) => s.setSplitMode)
  const clearSplitCutPoints = usePdfStore((s) => s.clearSplitCutPoints)

  const baseName = fileName.replace(/\.pdf$/i, '')
  const dirPickerSupported = hasDirectoryPickerSupport()

  // 各セグメントのファイル名（初期値: baseName_001 など、拡張子なし）
  const [fileNames, setFileNames] = useState<string[]>(
    segments.map((_, i) => `${baseName}_${String(i + 1).padStart(3, '0')}`),
  )

  // 各セグメントの候補リスト（ラベル付き優先 + 漢字パターン）
  const [candidates, setCandidates] = useState<string[][]>(segments.map(() => []))
  // 各セグメントの候補ソース（'pdf' = 埋め込みテキスト / 'ocr' = OCR）
  const [candidateSource, setCandidateSource] = useState<('pdf' | 'ocr' | null)[]>(
    segments.map(() => null),
  )
  // 各セグメントの OCR 実行状態
  const [ocrStatus, setOcrStatus] = useState<('idle' | 'running')[]>(
    segments.map(() => 'idle'),
  )
  const [ocrProgress, setOcrProgress] = useState<Record<number, number>>({})

  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  const updateFileName = (index: number, value: string) => {
    const next = [...fileNames]
    next[index] = value
    setFileNames(next)
  }

  // 初回マウント: 全セグメントの埋め込みテキストから候補を抽出
  useEffect(() => {
    const pdf = getCurrentPdf()
    if (!pdf) return

    let canceled = false
    ;(async () => {
      for (let i = 0; i < segments.length; i++) {
        if (canceled) return
        const seg = segments[i]
        const cands = await extractTextCandidates(pdf, seg.start)
        if (canceled) return
        if (cands.length > 0) {
          setCandidates((prev) => {
            const next = [...prev]
            next[i] = cands
            return next
          })
          setCandidateSource((prev) => {
            const next = [...prev]
            next[i] = 'pdf'
            return next
          })
        }
      }
    })()

    return () => { canceled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // OCR で候補を取得（スキャンPDFや埋め込みテキストが少ないPDF向け）
  const handleOcr = async (i: number) => {
    const pdf = getCurrentPdf()
    if (!pdf) return

    setOcrStatus((prev) => { const n = [...prev]; n[i] = 'running'; return n })
    setOcrProgress((prev) => ({ ...prev, [i]: 0 }))

    try {
      const seg = segments[i]
      // OCR 精度のため高解像度（scale=2.0）で描画
      const canvas = document.createElement('canvas')
      await renderPageToCanvas(pdf, seg.start, 2.0, canvas, rotations[seg.start - 1] ?? 0)

      // 動的 import で OCR ライブラリを遅延読み込み
      const { ocrImage } = await import('../../lib/ocr')

      const text = await ocrImage(canvas, (status, progressValue) => {
        // recognizing は 0〜1 の小数で進捗が来る
        if (status.startsWith('recognizing')) {
          setOcrProgress((prev) => ({ ...prev, [i]: Math.round(progressValue * 100) }))
        }
      })

      const ocrCands = extractNameCandidatesFromText(text)
      setCandidates((prev) => {
        const next = [...prev]
        // 既存の候補（埋め込みテキスト由来）とマージ。OCR結果を後ろに
        const merged = [...new Set([...next[i], ...ocrCands])]
        next[i] = merged.slice(0, 12)
        return next
      })
      setCandidateSource((prev) => {
        const next = [...prev]
        // 既に PDF テキストもあれば 'pdf'+'ocr' 両方になるが、ソース表示は OCR を優先
        next[i] = next[i] === 'pdf' ? 'pdf' : 'ocr'
        if (ocrCands.length > 0 && next[i] === null) next[i] = 'ocr'
        return next
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`OCR エラー: ${msg}\n\n初回はOCR辞書 (約5MB) のダウンロードが必要です。ネットワーク接続を確認してください。`)
    } finally {
      setOcrStatus((prev) => { const n = [...prev]; n[i] = 'idle'; return n })
      setOcrProgress((prev) => {
        const next = { ...prev }
        delete next[i]
        return next
      })
    }
  }

  // ファイル名重複チェック
  const duplicateNames = (() => {
    const counts = new Map<string, number>()
    fileNames.forEach((n) => {
      const key = (n.trim() || `${baseName}_${String(0).padStart(3, '0')}`).toLowerCase().replace(/\.pdf$/i, '')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return new Set(Array.from(counts.entries()).filter(([, v]) => v > 1).map(([k]) => k))
  })()

  const getOutName = (i: number): string => {
    const raw = fileNames[i]?.trim() || `${baseName}_${String(i + 1).padStart(3, '0')}`
    return raw.toLowerCase().endsWith('.pdf') ? raw : `${raw}.pdf`
  }

  const handleSave = async () => {
    if (!pdfArrayBuffer) return

    if (!dirPickerSupported) {
      alert('このブラウザは「フォルダに一括保存」機能に対応していません。\nGoogle Chrome または Microsoft Edge をご利用ください。')
      return
    }

    const dirHandle = await pickDirectory()
    if (!dirHandle) return

    setIsProcessing(true)
    setProgress(0)
    setProgressLabel('準備中...')

    try {
      for (let i = 0; i < segments.length; i++) {
        setProgressLabel(`${i + 1}/${segments.length}: ${getOutName(i)}`)
        const seg = segments[i]
        const pages = Array.from(
          { length: seg.end - seg.start + 1 },
          (_, j) => seg.start + j,
        )
        const bytes = await extractPages(pdfArrayBuffer, pages, rotations, stamps)
        await saveFileToDirectory(dirHandle, bytes, getOutName(i))
        setProgress(i + 1)
      }

      setSplitMode(false)
      clearSplitCutPoints()
      onDone()
      alert(`✅ ${segments.length}個のPDFに分割しました`)
    } catch (err) {
      alert(`分割エラー: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsProcessing(false)
      setProgressLabel('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl w-full"
        style={{ maxWidth: 1080, maxHeight: '92vh' }}
      >

        {/* ヘッダー */}
        <div className="border-b border-gray-100 px-6 py-4 flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">
              ✂ 分割ファイルのファイル名を設定
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              候補をクリックでファイル名に設定できます。候補が出ない場合は「OCRで認識」をお試しください。
            </p>
          </div>
          <div className="flex-shrink-0 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
            {segments.length}個に分割
          </div>
        </div>

        {/* 非対応ブラウザ警告 */}
        {!dirPickerSupported && (
          <div className="mx-6 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            ⚠ このブラウザでは一括保存ができません。<strong>Google Chrome</strong> または <strong>Microsoft Edge</strong> でアクセスしてください。
          </div>
        )}

        {/* ギャラリーグリッド */}
        <div className="flex-1 overflow-y-auto p-5">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
              alignItems: 'start',
            }}
          >
            {segments.map((seg, i) => {
              const thumbSrc = thumbnails[seg.start - 1]
              const segColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length]
              const isFocused = focusedIndex === i
              const pageCount = seg.end - seg.start + 1
              const nameKey = (fileNames[i]?.trim() || '').toLowerCase().replace(/\.pdf$/i, '')
              const isDup = nameKey !== '' && duplicateNames.has(nameKey)
              const cands = candidates[i] ?? []
              const source = candidateSource[i]
              const isOcrRunning = ocrStatus[i] === 'running'
              const ocrPercent = ocrProgress[i]

              return (
                <div
                  key={i}
                  className="flex flex-col rounded-xl border-2 overflow-hidden transition-all"
                  style={{
                    borderColor: isDup ? '#ef4444' : (isFocused ? segColor : '#e5e7eb'),
                    boxShadow: isFocused ? `0 0 0 2px ${segColor}33` : undefined,
                  }}
                >
                  {/* カラーバー */}
                  <div className="h-1.5 w-full flex-shrink-0" style={{ background: segColor }} />

                  {/* サムネイル */}
                  <div className="relative bg-gray-100 flex items-center justify-center" style={{ aspectRatio: '1/1.414' }}>
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        className="w-full h-full object-contain"
                        alt={`グループ${i + 1} 表紙 (p${seg.start})`}
                        draggable={false}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                        <span className="text-xs">読み込み中</span>
                      </div>
                    )}

                    {/* グループ番号バッジ */}
                    <div
                      className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white shadow-md"
                      style={{ background: segColor }}
                    >
                      {i + 1}
                    </div>

                    {/* ページ数バッジ */}
                    <div className="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
                      {pageCount}p
                    </div>
                  </div>

                  {/* 情報 + ファイル名入力 */}
                  <div className="p-3 flex flex-col gap-2 bg-white">
                    <div className="text-xs text-gray-400 font-medium">
                      p{seg.start}〜p{seg.end}（{pageCount}ページ）
                    </div>

                    <div>
                      <input
                        type="text"
                        value={fileNames[i]}
                        onChange={(e) => updateFileName(i, e.target.value)}
                        onFocus={() => setFocusedIndex(i)}
                        onBlur={() => setFocusedIndex(null)}
                        disabled={isProcessing}
                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-50 focus:ring-1 ${
                          isDup
                            ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                            : 'border-gray-300 focus:border-blue-400 focus:ring-blue-200'
                        }`}
                        placeholder={`${baseName}_${String(i + 1).padStart(3, '0')}`}
                      />
                      <p className={`mt-1 text-xs truncate ${isDup ? 'text-red-500' : 'text-gray-400'}`}>
                        {isDup ? '⚠ 同名のファイル名があります' : getOutName(i)}
                      </p>
                    </div>

                    {/* 候補チップ */}
                    {cands.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400 font-medium">
                            候補
                          </span>
                          {source === 'ocr' && (
                            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-700">
                              OCR
                            </span>
                          )}
                          {source === 'pdf' && (
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                              PDF
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {cands.map((cand) => (
                            <button
                              key={cand}
                              onClick={() => updateFileName(i, cand)}
                              disabled={isProcessing}
                              className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50"
                              title={`「${cand}」をファイル名にする`}
                            >
                              {cand}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* OCR ボタン */}
                    {!isOcrRunning && (
                      <button
                        onClick={() => handleOcr(i)}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 hover:border-purple-300 disabled:opacity-50 transition-colors"
                        title={cands.length > 0 ? 'OCRで追加の候補を取得' : 'OCRで文字認識して候補を生成（初回は約5MBダウンロード）'}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
                        </svg>
                        {cands.length > 0 ? 'OCRで候補追加' : 'OCRで認識'}
                      </button>
                    )}
                    {isOcrRunning && (
                      <div className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-purple-700 font-semibold">OCR実行中</span>
                          <span className="text-[10px] text-purple-700 tabular-nums">
                            {typeof ocrPercent === 'number' ? `${ocrPercent}%` : '初期化中...'}
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-purple-200">
                          <div
                            className="h-full rounded-full bg-purple-600 transition-all duration-300"
                            style={{ width: `${ocrPercent ?? 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* フッター */}
        <div className="border-t border-gray-100 px-6 py-4">
          {/* 進捗バー */}
          {isProcessing && (
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-gray-600">
                <span className="truncate max-w-[60%]" title={progressLabel}>{progressLabel}</span>
                <span className="font-medium">{progress} / {segments.length}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${Math.round((progress / segments.length) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 items-center">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              戻って分割点を修正
            </button>

            <p className="ml-2 flex-1 text-xs text-gray-500">
              {isProcessing
                ? 'フォルダに保存しています...'
                : '次の画面で保存先フォルダを1回だけ選択します。すべてのPDFがそのフォルダに直接保存されます。'}
            </p>

            <button
              onClick={handleSave}
              disabled={isProcessing || !dirPickerSupported}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {isProcessing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  保存中...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                  フォルダを選んで{segments.length}個保存
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
