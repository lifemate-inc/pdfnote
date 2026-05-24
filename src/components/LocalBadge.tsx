/**
 * 「ローカル動作中」バッジ
 * 個人情報がサーバーに送信されないことを常に可視化する
 * 画面左下に固定表示
 */
export const LocalBadge = () => (
  <div className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 shadow-sm select-none">
    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
    ローカル動作中 — 個人情報はPCの外に出ません
  </div>
)
