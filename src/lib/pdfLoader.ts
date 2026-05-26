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
  // 既存ドキュメントの完全解放（非同期 destroy を待つ）
  if (_currentPdf) {
    try {
      await _currentPdf.destroy()
    } catch {
      // 既に破棄済みなど
    }
    _currentPdf = null
    // GC のタイミングを与える
    await new Promise((r) => setTimeout(r, 0))
  }
  _currentPdf = await pdfjsLib.getDocument({ data }).promise
  return _currentPdf
}

/** 現在の PDF ドキュメントを明示的に破棄（タブ離脱時など） */
export const destroyCurrentPdf = async (): Promise<void> => {
  if (_currentPdf) {
    try {
      await _currentPdf.destroy()
    } catch {
      // ignore
    }
    _currentPdf = null
  }
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
 * テキストから氏名らしき候補を抽出する
 * - 「氏名」「お名前」「利用者」等のラベル直後の文字列を最優先で抽出
 * - 補完として 2〜4 文字の漢字連続を抽出
 * PDF の埋め込みテキストおよび OCR 結果の両方で使用する
 */
export const extractNameCandidatesFromText = (text: string): string[] => {
  const labeled: string[] = []
  const unlabeled: string[] = []

  // パターン1: ラベル直後の名前（高確度）
  // 例: 「氏名: 山田太郎」「ご利用者様 田中花子」「お名前　佐藤一郎」
  const labelPattern = /(?:氏名|お名前|姓名|利用者(?:名|者名|様)?|お客様(?:名)?|患者(?:名)?|被保険者(?:名)?|名前|入所者|入居者)[\s　:：・]*([一-鿿㐀-䶿々]{2,4}(?:[\s　]*[一-鿿㐀-䶿々ぁ-んァ-ンー]{1,4})?)/g
  let match
  while ((match = labelPattern.exec(text)) !== null) {
    const name = match[1].replace(/[\s　]/g, '').slice(0, 8)
    if (name.length >= 2) labeled.push(name)
  }

  // パターン2: 漢字 2〜4 文字の連続（低確度・補完）
  const kanjiPattern = /[一-鿿㐀-䶿々]{2,4}/g
  const kanjiMatches = text.match(kanjiPattern) ?? []
  // ラベル付きで既に含まれているものはスキップ
  for (const m of kanjiMatches) {
    if (!labeled.includes(m) && !unlabeled.includes(m)) {
      unlabeled.push(m)
    }
  }

  // ラベル付きを優先、補完で漢字パターン
  return [...labeled, ...unlabeled].slice(0, 10)
}

/**
 * 指定ページの埋め込みテキストから氏名候補を抽出する
 * （PDF.js の getTextContent を使用、OCR は使わない）
 * スキャンPDFなど埋め込みテキストがない場合は空配列を返す
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
      .join(' ')
    page.cleanup()

    return extractNameCandidatesFromText(text)
  } catch {
    return []
  }
}
