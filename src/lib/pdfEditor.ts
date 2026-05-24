import { PDFDocument, degrees } from 'pdf-lib'
import { getCurrentPdf } from './pdfLoader'

/**
 * 選択したページを抽出して新しい PDF バイト列を返す
 */
export const extractPages = async (
  arrayBuffer: ArrayBuffer,
  pageNums: number[],
  rotationDeltas: number[],
): Promise<Uint8Array> => {
  const srcDoc = await PDFDocument.load(arrayBuffer.slice(0))
  const newDoc = await PDFDocument.create()

  const indices = pageNums.map((n) => n - 1)
  const copiedPages = await newDoc.copyPages(srcDoc, indices)

  copiedPages.forEach((page, i) => {
    newDoc.addPage(page)
    const pageNum = pageNums[i]
    const delta = rotationDeltas[pageNum - 1] ?? 0
    if (delta !== 0) {
      const existing = page.getRotation().angle
      page.setRotation(degrees((existing + delta) % 360))
    }
  })

  return newDoc.save()
}

/**
 * 全ページにスタンプを焼き込んで PDF バイト列を返す
 *
 * pdf.js でページを canvas に描画 → スタンプをテキストで合成 →
 * PNG として pdf-lib に埋め込む（ラスター変換方式）
 *
 * ラスター変換のためベクター品質は失われるが、日本語テキストをシステムフォントで描画できる利点がある
 */
export const savePdfWithStamps = async (
  stamps: Array<
    Array<{
      id: string
      x: number
      y: number
      text: string
      fontSize: number
      color: string
      bold: boolean
    }>
  >,
  rotations: number[],
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> => {
  const pdf = getCurrentPdf()
  if (!pdf) throw new Error('PDFが読み込まれていません')

  const newDoc = await PDFDocument.create()
  const RENDER_SCALE = 2.0 // 印刷品質用の高解像度レンダリング

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const delta = rotations[pageNum - 1] ?? 0
    const viewport = page.getViewport({ scale: RENDER_SCALE, rotation: delta })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport }).promise

    // スタンプをキャンバスに描画（システムフォント使用 → 日本語対応）
    const pageStamps = stamps[pageNum - 1] ?? []
    for (const stamp of pageStamps) {
      ctx.save()
      ctx.font = `${stamp.bold ? 'bold ' : ''}${stamp.fontSize * RENDER_SCALE}px "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif`
      ctx.fillStyle = stamp.color
      ctx.textBaseline = 'middle'
      ctx.fillText(stamp.text, stamp.x * canvas.width, stamp.y * canvas.height)
      ctx.restore()
    }

    page.cleanup()

    // canvas → PNG blob → pdf-lib に埋め込み
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92),
    )
    const arrayBuffer = await blob.arrayBuffer()
    const jpgBytes = new Uint8Array(arrayBuffer)
    const jpgImage = await newDoc.embedJpg(jpgBytes)

    // pdf-lib のページサイズは scale=1.0 で計算する（viewport に rotation 込み）
    const naturalViewport = page.getViewport({ scale: 1.0, rotation: delta })
    const newPage = newDoc.addPage([naturalViewport.width, naturalViewport.height])
    newPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: naturalViewport.width,
      height: naturalViewport.height,
    })

    onProgress?.(pageNum, pdf.numPages)

    // UI 更新を許可
    if (pageNum % 10 === 0) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  return newDoc.save()
}
