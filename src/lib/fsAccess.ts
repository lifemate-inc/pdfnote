/**
 * File System Access API を使ってファイルを保存する
 * Chrome / Edge では保存先ダイアログが開く
 * Safari / Firefox などの非対応ブラウザは blob ダウンロードにフォールバック
 */
export const saveFile = async (
  bytes: Uint8Array,
  suggestedName: string,
): Promise<void> => {
  if ('showSaveFilePicker' in window) {
    try {
      // TypeScript の型定義が古い場合に備えて型アサーション
      const handle = await (
        window as Window & {
          showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>
        }
      ).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'PDF ファイル',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      })
      const writable = await handle.createWritable()
      // Uint8Array<ArrayBufferLike> → ArrayBuffer に変換して渡す
      await writable.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      await writable.close()
      return
    } catch (err) {
      // ユーザーがキャンセルした場合は何もしない
      if (err instanceof DOMException && err.name === 'AbortError') return
      throw err
    }
  }

  // フォールバック: blob ダウンロード（Safari / Firefox）
  const blob = new Blob(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    { type: 'application/pdf' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** File System Access API に対応しているブラウザかどうかを返す */
export const hasFsaSupport = (): boolean => 'showSaveFilePicker' in window
