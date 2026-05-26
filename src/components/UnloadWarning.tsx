import { useEffect } from 'react'
import { usePdfStore } from '../stores/usePdfStore'

/**
 * 未保存の編集がある状態でタブを閉じる/リロードしようとしたときに確認ダイアログを出す
 * - 編集 = メモ追加 or 回転変更 が1つでもある状態
 * - PDF 自体は IndexedDB に保存されるが、出力PDFは未保存なので警告
 */
export const UnloadWarning = () => {
  const stamps = usePdfStore((s) => s.stamps)
  const rotations = usePdfStore((s) => s.rotations)
  const pageCount = usePdfStore((s) => s.pageCount)

  const hasEdits =
    pageCount > 0 &&
    (stamps.some((s) => s.length > 0) || rotations.some((r) => r !== 0))

  useEffect(() => {
    if (!hasEdits) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 一部のブラウザは独自メッセージを無視する（標準の警告が出る）
      e.returnValue = '保存していない編集があります。本当にページを離れますか？'
      return e.returnValue
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasEdits])

  return null
}
