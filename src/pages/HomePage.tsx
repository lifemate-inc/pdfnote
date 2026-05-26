import { useState } from 'react'
import { DropZone } from '../components/DropZone'
import { HeavyPdfModal } from '../components/modals/HeavyPdfModal'

export const HomePage = () => {
  const [heavyFile, setHeavyFile] = useState<File | null>(null)

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 min-h-screen">
      {/* ロゴ・タイトル */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">PDFノート</h1>
        </div>
        <p className="text-gray-500 text-sm">
          PDFの閲覧・分割・回転・テキスト追記を、ローカルで安全に処理
        </p>
      </div>

      {/* ドロップゾーン */}
      <div className="w-full max-w-xl">
        <DropZone onHeavyFile={setHeavyFile} />
      </div>

      {/* 機能説明 */}
      <div className="mt-8 flex gap-6 text-center">
        {[
          { icon: '✂️', label: 'ページ抽出・分割' },
          { icon: '🔄', label: 'ページ回転' },
          { icon: '🖊️', label: 'スタンプ追記' },
          { icon: '🔒', label: 'ローカル完結' },
        ].map(({ icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className="text-2xl">{icon}</span>
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* 大容量PDFのヒント（情報提示のみ） */}
      <div className="mt-12 text-center">
        <p className="text-xs text-gray-400">
          大容量PDFで動作が重い場合は、まず開いてから「分割」機能で小さく分けてご利用ください
        </p>
      </div>

      {/* 重いPDF 警告モーダル */}
      {heavyFile && (
        <HeavyPdfModal
          file={heavyFile}
          onContinue={() => setHeavyFile(null)}
          onCancel={() => setHeavyFile(null)}
        />
      )}
    </div>
  )
}
