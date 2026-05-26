import { PDFDocument, degrees } from 'pdf-lib'
import { getCurrentPdf } from './pdfLoader'

export interface StampLike {
  id: string
  x: number  // 0〜1（ページ幅比）
  y: number  // 0〜1（ページ高さ比）
  text: string
  fontSize: number
  color: string
  bold: boolean
}

const RENDER_SCALE = 2.0  // 印刷品質用の高解像度レンダリング
const JPEG_QUALITY = 0.92

/**
 * 1ページをラスタライズしてJPEG画像のbytes + ナチュラルサイズを返す（メモ込み）
 */
const rasterizePageWithStamps = async (
  pageNum: number,
  rotation: number,
  pageStamps: StampLike[],
): Promise<{ jpgBytes: Uint8Array; width: number; height: number }> => {
  const pdf = getCurrentPdf()
  if (!pdf) throw new Error('PDFが読み込まれていません')

  const page = await pdf.getPage(pageNum)
  try {
    const viewport = page.getViewport({ scale: RENDER_SCALE, rotation })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!

    await page.render({ canvasContext: ctx, viewport }).promise

    // メモをキャンバスに描画（システムフォント使用 → 日本語対応）
    for (const stamp of pageStamps) {
      ctx.save()
      ctx.font = `${stamp.bold ? 'bold ' : ''}${stamp.fontSize * RENDER_SCALE}px "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif`
      ctx.fillStyle = stamp.color
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText(stamp.text, stamp.x * canvas.width, stamp.y * canvas.height)
      ctx.restore()
    }

    // canvas → JPEG blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
    const arrayBuffer = await blob.arrayBuffer()
    const jpgBytes = new Uint8Array(arrayBuffer)

    const naturalViewport = page.getViewport({ scale: 1.0, rotation })
    return {
      jpgBytes,
      width: naturalViewport.width,
      height: naturalViewport.height,
    }
  } finally {
    page.cleanup()
  }
}

/**
 * 指定ページ群を新PDFとして書き出す（統合関数）
 *
 * 各ページの扱い:
 * - メモがあるページ → 高解像度ラスタライズしてJPEG埋め込み（メモが焼き込まれる）
 * - メモがないページ → 元PDFからベクターのままコピー（品質維持・サイズ小）
 *
 * 回転は両方のケースで適用される
 *
 * @param srcArrayBuffer 元PDFの ArrayBuffer
 * @param pageNums 抽出するページ番号（1-based）。順序がそのまま出力ページ順
 * @param rotations rotations[i] = ページ番号 i+1 の回転角度（0/90/180/270）
 * @param stamps stamps[i] = ページ番号 i+1 のメモ配列
 * @param onProgress 進捗コールバック (current, total)
 */
export const buildPdf = async (
  srcArrayBuffer: ArrayBuffer,
  pageNums: number[],
  rotations: number[],
  stamps: StampLike[][],
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> => {
  const srcDoc = await PDFDocument.load(srcArrayBuffer.slice(0))
  const newDoc = await PDFDocument.create()

  for (let i = 0; i < pageNums.length; i++) {
    const pageNum = pageNums[i]
    const rotation = rotations[pageNum - 1] ?? 0
    const pageStamps = stamps[pageNum - 1] ?? []

    if (pageStamps.length > 0) {
      // メモあり → ラスタライズして埋め込み
      const { jpgBytes, width, height } = await rasterizePageWithStamps(
        pageNum,
        rotation,
        pageStamps,
      )
      const jpgImage = await newDoc.embedJpg(jpgBytes)
      const newPage = newDoc.addPage([width, height])
      newPage.drawImage(jpgImage, { x: 0, y: 0, width, height })
    } else {
      // メモなし → ベクターのまま元PDFからコピー
      const [copied] = await newDoc.copyPages(srcDoc, [pageNum - 1])
      newDoc.addPage(copied)
      if (rotation !== 0) {
        const existing = copied.getRotation().angle
        copied.setRotation(degrees((existing + rotation) % 360))
      }
    }

    onProgress?.(i + 1, pageNums.length)

    // UI更新を許可（大量ページ時）
    if ((i + 1) % 10 === 0) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  return newDoc.save()
}

/**
 * 指定ページのみ抽出（メモ・回転反映）
 * 内部的には buildPdf に委譲
 */
export const extractPages = async (
  srcArrayBuffer: ArrayBuffer,
  pageNums: number[],
  rotations: number[],
  stamps: StampLike[][],
): Promise<Uint8Array> => {
  return buildPdf(srcArrayBuffer, pageNums, rotations, stamps)
}

/**
 * 全ページを保存する（メモ・回転反映）
 */
export const buildPdfAllPages = async (
  srcArrayBuffer: ArrayBuffer,
  rotations: number[],
  stamps: StampLike[][],
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> => {
  const pdf = getCurrentPdf()
  if (!pdf) throw new Error('PDFが読み込まれていません')

  const pageNums = Array.from({ length: pdf.numPages }, (_, i) => i + 1)
  return buildPdf(srcArrayBuffer, pageNums, rotations, stamps, onProgress)
}
