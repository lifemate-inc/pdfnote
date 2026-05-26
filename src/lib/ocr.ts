/**
 * Tesseract.js OCR ラッパー
 *
 * - 完全ローカル動作: 画像データは外部に送信されない
 * - エンジン（wasm/worker）と学習データは public/tesseract/ から同一オリジンで取得
 *   → CSP `connect-src 'self'` の範囲内、外部通信なし
 * - ライブラリ本体は dynamic import で遅延読み込み（初期バンドル肥大化を防ぐ）
 * - 学習データはブラウザの IndexedDB にキャッシュされるため 2 回目以降は高速
 */
import type { Worker as TesseractWorker } from 'tesseract.js'

let workerPromise: Promise<TesseractWorker> | null = null

// OCR 実行を直列化するためのキュー（Tesseract.js は単一ワーカーで並列処理不可）
let ocrQueue: Promise<unknown> = Promise.resolve()

/** OCR ワーカー初期化（初回呼び出しのみ実行） */
const initWorker = async (
  onProgress?: (status: string, progress: number) => void,
): Promise<TesseractWorker> => {
  // Tesseract.js 本体を遅延読み込み
  const { createWorker } = await import('tesseract.js')

  // 同一オリジンの static asset として配信されるパス
  // import.meta.env.BASE_URL は Vite の base 設定（GitHub Pages の階層対応）
  const baseUrl = `${import.meta.env.BASE_URL}tesseract/`.replace(/\/+/g, '/')

  const worker = await createWorker('jpn', 1, {
    workerPath: `${baseUrl}worker.min.js`,
    langPath: baseUrl,
    corePath: baseUrl,
    // gzip 圧縮版ではない uncompressed .traineddata を使用
    gzip: false,
    logger: (m) => {
      if (onProgress && m.status && typeof m.progress === 'number') {
        onProgress(m.status, m.progress)
      }
    },
  })
  return worker
}

/**
 * Canvas / Image / dataURL を OCR してテキストを返す
 * 初回呼び出し時に約 3MB(エンジン)+2.4MB(学習データ) を fetch（同一オリジン）
 */
export const ocrImage = async (
  source: HTMLCanvasElement | HTMLImageElement | string,
  onProgress?: (status: string, progress: number) => void,
): Promise<string> => {
  if (!workerPromise) {
    workerPromise = initWorker(onProgress)
  }
  // 既存OCRの完了を待ってから自分の処理を行う（直列化）
  const myTurn = ocrQueue.then(async () => {
    const worker = await workerPromise!
    const { data } = await worker.recognize(source)
    return data.text
  })
  // 次のOCRが myTurn を待つようにキューを更新（失敗しても次に進めるためcatch）
  ocrQueue = myTurn.catch(() => undefined)
  return myTurn
}

/**
 * OCR ワーカーを破棄してメモリを解放する
 * （ページ離脱時などに呼ぶと良い。任意）
 */
export const terminateOcrWorker = async (): Promise<void> => {
  if (workerPromise) {
    const worker = await workerPromise
    await worker.terminate()
    workerPromise = null
  }
}
