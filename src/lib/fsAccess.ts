/**
 * File System Access API を使ってファイルを保存する
 * Chrome / Edge では保存先ダイアログが開く
 * Safari / Firefox などの非対応ブラウザは blob ダウンロードにフォールバック
 */
export const saveFile = async (
  bytes: Uint8Array,
  suggestedName: string,
): Promise<void> => {
  const safeName = sanitizeFileName(suggestedName)
  if ('showSaveFilePicker' in window) {
    try {
      // TypeScript の型定義が古い場合に備えて型アサーション
      const handle = await (
        window as Window & {
          showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>
        }
      ).showSaveFilePicker({
        suggestedName: safeName,
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
  a.download = safeName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** File System Access API に対応しているブラウザかどうかを返す */
export const hasFsaSupport = (): boolean => 'showSaveFilePicker' in window

/** showDirectoryPicker に対応しているブラウザかどうかを返す（Chrome/Edge のみ対応） */
export const hasDirectoryPickerSupport = (): boolean => 'showDirectoryPicker' in window

/**
 * フォルダ選択ダイアログを表示し、書き込み可能なディレクトリハンドルを返す
 * ユーザーがキャンセルした場合は null
 */
export const pickDirectory = async (): Promise<FileSystemDirectoryHandle | null> => {
  if (!('showDirectoryPicker' in window)) return null
  try {
    const handle = await (
      window as Window & {
        showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
      }
    ).showDirectoryPicker({ mode: 'readwrite' })
    return handle
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

/**
 * ファイル名からOSの禁止文字を取り除く
 * - Windows禁止文字: < > : " / \ | ? *
 * - 制御文字 (0x00-0x1F)
 * - 末尾の空白とピリオド（Windowsで無効）
 * - 予約名 (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
 */
export const sanitizeFileName = (name: string): string => {
  // 1. 禁止文字を _ に置換
  let safe = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  // 2. 末尾の空白とピリオドを除去
  safe = safe.replace(/[\s.]+$/, '')
  // 3. 空文字なら fallback
  if (!safe) safe = 'untitled'
  // 4. Windows予約名チェック（拡張子前の部分）
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.[^.]*)?$/i
  if (reserved.test(safe)) safe = `_${safe}`
  // 5. 長すぎる場合は切り詰め（拡張子を保護）
  if (safe.length > 200) {
    const ext = safe.match(/\.[^.]+$/)?.[0] ?? ''
    safe = safe.slice(0, 200 - ext.length) + ext
  }
  return safe
}

/**
 * 指定したディレクトリハンドルにファイルを書き込む
 * 同名ファイルが存在する場合は上書き
 */
export const saveFileToDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
  bytes: Uint8Array,
  fileName: string,
): Promise<void> => {
  const safeName = sanitizeFileName(fileName)
  const fileHandle = await dirHandle.getFileHandle(safeName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  await writable.close()
}
