import { useEffect, useState } from 'react'
import { usePdfStore } from '../../stores/usePdfStore'
import { loadSession, clearSession, type SavedSession } from '../../lib/persistence'

/**
 * 起動時に前回のセッションが見つかれば「復元しますか？」を表示するモーダル
 * - PDF を新規に開いた直後は表示しない
 * - ユーザーが「破棄」を選んだら IndexedDB をクリア
 */
export const RestorePrompt = () => {
  const pageCount = usePdfStore((s) => s.pageCount)
  const isLoading = usePdfStore((s) => s.isLoading)
  const restoreSession = usePdfStore((s) => s.restoreSession)
  const [session, setSession] = useState<SavedSession | null>(null)
  const [checked, setChecked] = useState(false)

  // 「別のPDF」で新規タブを開いた場合（?new=1）は復元プロンプトをスキップ
  const isNewTab =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('new') === '1'

  // マウント時に1回だけ IndexedDB を確認（新規タブ意図ならスキップ）
  useEffect(() => {
    if (isNewTab) {
      setChecked(true)
      return
    }
    let canceled = false
    loadSession().then((s) => {
      if (!canceled) {
        setSession(s)
        setChecked(true)
      }
    })
    return () => { canceled = true }
  }, [isNewTab])

  // PDF が既に開かれていたら表示しない（チェック前は何もしない）
  if (!checked) return null
  if (pageCount > 0 || isLoading) return null
  if (!session) return null

  const sizeMB = (session.fileSize / 1024 / 1024).toFixed(1)
  const editCount =
    session.stamps.reduce((s, arr) => s + arr.length, 0) +
    session.rotations.filter((r) => r !== 0).length
  const elapsedMin = Math.max(1, Math.round((Date.now() - session.savedAt) / 60000))

  const handleRestore = async () => {
    await restoreSession(session)
    setSession(null)
  }

  const handleDiscard = async () => {
    await clearSession()
    setSession(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            🔄 前回の作業が見つかりました
          </h2>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm">
            <div className="font-medium text-gray-800 truncate" title={session.fileName}>
              📄 {session.fileName}
            </div>
            <div className="mt-1 text-xs text-gray-500 space-y-0.5">
              <div>{session.pageCount}ページ・{sizeMB}MB</div>
              <div>編集箇所: {editCount > 0 ? `${editCount}件` : 'なし'}</div>
              <div>{elapsedMin}分前に保存</div>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            復元すると前回のメモ・回転がそのまま使えます。新しいPDFを開く場合は「破棄して新規」を選んでください。
          </p>
        </div>
        <div className="flex gap-2 border-t border-gray-100 px-6 py-3 bg-gray-50">
          <button
            onClick={handleDiscard}
            className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            破棄して新規
          </button>
          <button
            onClick={handleRestore}
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            前回を復元
          </button>
        </div>
      </div>
    </div>
  )
}
