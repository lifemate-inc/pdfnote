import { usePdfStore } from '../../stores/usePdfStore'

interface HeavyPdfModalProps {
  file: File
  onContinue: () => void
  onCancel: () => void
}

/**
 * 大容量PDFを開こうとしたときに表示する警告モーダル
 * 50MB 超のファイルが検出されたときに呼ばれる
 */
export const HeavyPdfModal = ({ file, onContinue, onCancel }: HeavyPdfModalProps) => {
  const loadPdf = usePdfStore((s) => s.loadPdf)

  const fileSizeMB = (file.size / 1024 / 1024).toFixed(1)

  const handleContinue = () => {
    onContinue()
    loadPdf(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 border-b border-gray-100 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">大容量PDFの検出</h2>
            <p className="text-sm text-gray-500">{fileSizeMB} MB のファイルです</p>
          </div>
        </div>

        {/* 本文 */}
        <div className="p-6 space-y-3">
          <p className="text-sm text-gray-700">
            このファイルは大容量（{fileSizeMB} MB）です。
            そのまま開くとメモリ不足になる可能性があります。
          </p>
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <p className="font-medium">💡 ヒント</p>
            <p className="mt-1">
              「そのまま開く」を選んでも問題なく動作する場合が多いです。
              万が一重くなった場合は、一度閉じてから「事前分割」機能をお試しください。
            </p>
          </div>
        </div>

        {/* ボタン */}
        <div className="flex gap-3 border-t border-gray-100 p-6">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleContinue}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            そのまま開く
          </button>
        </div>
      </div>
    </div>
  )
}
