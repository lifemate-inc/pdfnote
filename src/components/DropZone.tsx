import React, { useRef, useState } from 'react'
import { usePdfStore } from '../stores/usePdfStore'

interface DropZoneProps {
  /** 重いPDFを検出したときに呼ばれる（ファイルを渡す） */
  onHeavyFile?: (file: File) => void
}

/** 重いPDFの閾値 */
const HEAVY_FILE_THRESHOLD = 50 * 1024 * 1024 // 50MB

export const DropZone: React.FC<DropZoneProps> = ({ onHeavyFile }) => {
  const loadPdf = usePdfStore((s) => s.loadPdf)
  const isLoading = usePdfStore((s) => s.isLoading)
  const status = usePdfStore((s) => s.status)
  const loadProgress = usePdfStore((s) => s.loadProgress)

  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('PDF ファイルのみ対応しています。')
      return
    }
    if (file.size > HEAVY_FILE_THRESHOLD && onHeavyFile) {
      onHeavyFile(file)
      return
    }
    loadPdf(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // 同じファイルを再選択できるよう value をリセット
    e.target.value = ''
  }

  return (
    <div
      className={`
        flex flex-col items-center justify-center rounded-2xl border-2 border-dashed
        transition-all duration-200 cursor-pointer select-none
        ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/40'
        }
        ${isLoading ? 'pointer-events-none opacity-80' : ''}
      `}
      style={{ minHeight: 280 }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isLoading && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      aria-label="PDF ファイルをドロップまたはクリックして選択"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleChange}
      />

      {isLoading ? (
        // ローディング状態
        <div className="flex flex-col items-center gap-4 px-8 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-blue-700">{status}</p>
          {loadProgress > 0 && loadProgress < 100 && (
            <div className="w-64 overflow-hidden rounded-full bg-blue-100" style={{ height: 6 }}>
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        // 通常状態
        <div className="flex flex-col items-center gap-4 px-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-800">
              📥 PDF をここにドロップ
            </p>
            <p className="mt-1 text-sm text-gray-500">
              または クリックしてファイルを選択
            </p>
          </div>
          <div className="mt-2 rounded-lg bg-gray-50 px-4 py-2 text-xs text-gray-400">
            対応形式: PDF（推奨: 100MB以下、200ページ程度まで快適に動作）
          </div>
        </div>
      )}
    </div>
  )
}
