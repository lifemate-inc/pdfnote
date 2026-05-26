import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Service Worker 更新通知UI
 * 新しいバージョンが利用可能になったらバナーを表示し、ユーザーがリロードを選択できる
 */
export const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // 1時間ごとに更新チェック
      if (r) {
        setInterval(() => {
          r.update()
        }, 60 * 60 * 1000)
      }
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-blue-200 bg-white shadow-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">新しいバージョンがあります</div>
          <p className="mt-0.5 text-xs text-gray-500">
            「更新」をクリックすると最新版で再読み込みします
          </p>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-3">
        <button
          onClick={() => setNeedRefresh(false)}
          className="flex-1 rounded-lg border border-gray-300 bg-white py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          あとで
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          更新する
        </button>
      </div>
    </div>
  )
}
