import { useEffect, useRef, useState } from 'react'

/**
 * 「ローカル動作中」バッジ
 * 個人情報がサーバーに送信されないことを常に可視化する
 * 画面左下に固定表示。一定時間後に目立たなくなり、ホバーで復活。
 */
export const LocalBadge = () => {
  const [faded, setFaded] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 8秒後に小さくフェードアウト
  useEffect(() => {
    fadeTimerRef.current = setTimeout(() => setFaded(true), 8000)
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [])

  // ホバーで元の表示に戻し、離れたら 4秒後に再フェード
  const handleMouseEnter = () => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    setFaded(false)
  }

  const handleMouseLeave = () => {
    fadeTimerRef.current = setTimeout(() => setFaded(true), 4000)
  }

  return (
    <div
      className={`fixed bottom-4 left-4 z-50 select-none cursor-default transition-all duration-1000 ${
        faded ? 'opacity-20 scale-90 origin-bottom-left' : 'opacity-100 scale-100 origin-bottom-left'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title="このアプリはすべてローカルで動作します。PDFデータはサーバーに送信されません。"
    >
      <div className="flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 shadow-sm">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
        ローカル動作中 — 個人情報はPCの外に出ません
      </div>
    </div>
  )
}
