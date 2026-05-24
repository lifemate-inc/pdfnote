import * as pdfjsLib from 'pdfjs-dist'

// pdf.js worker の設定（Vite が URL を自動解決してバンドルする）
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

// モジュールレベルで現在の PDF ドキュメントを保持（コンポーネント外でも参照できるように）
let _currentPdf: pdfjsLib.PDFDocumentProxy | null = null

export const getCurrentPdf = (): pdfjsLib.PDFDocumentProxy | null => _currentPdf

/**
 * PDF ファイルを読み込んで pdf.js ドキュメントを返す
 * 前回のドキュメントが存在する場合はメモリを解放してから読み込む
 */
export const loadPdfDocument = async (
  data: ArrayBuffer,
): Promise<pdfjsLib.PDFDocumentProxy> => {
  if (_currentPdf) {
    _currentPdf.destroy()
    _currentPdf = null
  }
  _currentPdf = await pdfjsLib.getDocument({ data }).promise
  return _currentPdf
}

/**
 * 指定ページをサムネイル用の JPEG data URL に変換する
 * scale: 0.3 程度が速度とクオリティのバランスが良い
 */
export const generateThumbnail = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale = 0.3,
): Promise<string> => {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
  page.cleanup()
  return dataUrl
}

/**
 * 指定ページを既存の canvas 要素に描画する（プレビュー用）
 */
export const renderPageToCanvas = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale: number,
  canvas: HTMLCanvasElement,
  rotation = 0,
): Promise<{ width: number; height: number }> => {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale, rotation })
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  page.cleanup()
  return { width: viewport.width, height: viewport.height }
}

/**
 * 指定ページのテキストから氏名候補（漢字 2〜4 文字）を抽出する
 * PDF 分割後のファイル名候補として使用する
 */
export const extractTextCandidates = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
): Promise<string[]> => {
  try {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const text = content.items
      .filter((item) => 'str' in item)
      .map((item) => (item as { str: string }).str)
      .join('')
    page.cleanup()

    // 漢字 2〜4 文字の連続（氏名の可能性が高いパターン）
    const pattern = /[一-鿿㐀-䶿]{2,4}/g
    const matches = [...new Set(text.match(pattern) ?? [])]
    return matches.slice(0, 8)
  } catch {
    return []
  }
}
