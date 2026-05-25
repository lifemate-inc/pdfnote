import { create } from 'zustand'
import { loadPdfDocument, generateThumbnail } from '../lib/pdfLoader'

// ============================================================
// 型定義
// ============================================================

/** テキストメモ（旧称: スタンプ）のデータ */
export interface StampData {
  id: string
  /** ページ幅に対する比率 (0〜1) */
  x: number
  /** ページ高さに対する比率 (0〜1) */
  y: number
  text: string
  fontSize: number
  color: string
  bold: boolean
}

export type ThumbnailSizeLevel = 1 | 2 | 3 | 4 | 5 | 6

/** viewer: 縦スクロール閲覧画面（PDF開いた直後のデフォルト）/ list: サムネイル一覧 */
export type AppView = 'viewer' | 'list'

export const THUMBNAIL_SIZES: Record<ThumbnailSizeLevel, number> = {
  1: 80,
  2: 120,
  3: 160,
  4: 200,
  5: 260,
  6: 340,
}

export const THUMBNAIL_LABELS: Record<ThumbnailSizeLevel, string> = {
  1: '極小',
  2: '小',
  3: '中',
  4: '大',
  5: '特大',
  6: '巨大',
}

// ============================================================
// ストア定義
// ============================================================

interface PdfState {
  // PDF メタデータ
  fileName: string
  fileSize: number
  pageCount: number

  // サムネイル（インデックス = ページ番号 - 1）
  thumbnails: string[]
  loadProgress: number

  // ページごとの編集状態（インデックス = ページ番号 - 1）
  rotations: number[]
  stamps: StampData[][]

  // 選択状態（ページ抽出用）
  selectedPages: Set<number>
  lastClickedPage: number | null

  // 一括分割モード
  splitMode: boolean
  splitCutPoints: Set<number>  // 「このページの後で切る」ページ番号の集合

  // UI
  thumbnailSizeLevel: ThumbnailSizeLevel
  status: string
  isLoading: boolean
  appView: AppView
  previewPageNum: number

  // 生データ（pdf-lib 用）
  pdfArrayBuffer: ArrayBuffer | null

  // ============================================================
  // アクション
  // ============================================================
  loadPdf: (file: File) => Promise<void>
  togglePage: (pageNum: number, shiftKey: boolean, ctrlKey: boolean) => void
  selectAll: () => void
  clearSelection: () => void
  rotatePage: (pageNum: number) => void
  addStamp: (pageNum: number, stamp: StampData) => void
  removeStamp: (pageNum: number, stampId: string) => void
  setThumbnailSizeLevel: (level: ThumbnailSizeLevel) => void
  setAppView: (view: AppView) => void
  setPreviewPageNum: (n: number) => void
  setFileName: (name: string) => void
  setSplitMode: (mode: boolean) => void
  toggleSplitCutPoint: (afterPage: number) => void
  clearSplitCutPoints: () => void
  reset: () => void
}

export const usePdfStore = create<PdfState>()((set, get) => ({
  // 初期状態
  fileName: '',
  fileSize: 0,
  pageCount: 0,
  thumbnails: [],
  loadProgress: 0,
  rotations: [],
  stamps: [],
  selectedPages: new Set(),
  lastClickedPage: null,
  splitMode: false,
  splitCutPoints: new Set(),
  thumbnailSizeLevel: 4,
  status: '',
  isLoading: false,
  appView: 'viewer',
  previewPageNum: 1,
  pdfArrayBuffer: null,

  // ============================================================
  // PDF 読み込み
  // ============================================================
  loadPdf: async (file: File) => {
    set({
      isLoading: true,
      status: '読み込み中...',
      thumbnails: [],
      loadProgress: 0,
      selectedPages: new Set(),
      lastClickedPage: null,
      splitMode: false,
      splitCutPoints: new Set(),
      fileName: '',
      fileSize: 0,
      pageCount: 0,
      appView: 'viewer',  // PDF を開いたら閲覧画面へ
      previewPageNum: 1,
    })

    try {
      const arrayBuffer = await file.arrayBuffer()
      const bufferForPdfJs = arrayBuffer.slice(0)
      const bufferForPdfLib = arrayBuffer.slice(0)

      const pdf = await loadPdfDocument(bufferForPdfJs)

      set({
        fileName: file.name,
        fileSize: file.size,
        pageCount: pdf.numPages,
        pdfArrayBuffer: bufferForPdfLib,
        rotations: new Array(pdf.numPages).fill(0),
        stamps: Array.from({ length: pdf.numPages }, () => [] as StampData[]),
        status: `サムネイル生成中... (0/${pdf.numPages})`,
      })

      // scale 0.7: 巨大サイズでも文字が読めるクオリティ（0.5 だと拡大時に潰れる）
      const thumbnails: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const dataUrl = await generateThumbnail(pdf, i, 0.7)
        thumbnails.push(dataUrl)

        if (i % 8 === 0 || i === pdf.numPages) {
          const progress = Math.round((i / pdf.numPages) * 100)
          set({
            thumbnails: [...thumbnails],
            loadProgress: progress,
            status: `サムネイル生成中... (${i}/${pdf.numPages})`,
          })
          await new Promise((r) => setTimeout(r, 0))
        }
      }

      set({
        isLoading: false,
        status: `${pdf.numPages} ページを読み込みました`,
        loadProgress: 100,
      })
    } catch (err) {
      set({
        isLoading: false,
        status: `エラー: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  },

  // ============================================================
  // ページ選択
  // ============================================================
  togglePage: (pageNum: number, shiftKey: boolean, _ctrlKey: boolean) => {
    const { selectedPages, lastClickedPage } = get()
    const newSelected = new Set(selectedPages)

    if (shiftKey && lastClickedPage !== null) {
      const min = Math.min(lastClickedPage, pageNum)
      const max = Math.max(lastClickedPage, pageNum)
      for (let i = min; i <= max; i++) newSelected.add(i)
      set({ selectedPages: newSelected })
    } else {
      if (newSelected.has(pageNum)) {
        newSelected.delete(pageNum)
      } else {
        newSelected.add(pageNum)
      }
      set({ selectedPages: newSelected, lastClickedPage: pageNum })
    }
  },

  selectAll: () => {
    const { pageCount } = get()
    const all = new Set<number>()
    for (let i = 1; i <= pageCount; i++) all.add(i)
    set({ selectedPages: all })
  },

  clearSelection: () => {
    set({ selectedPages: new Set(), lastClickedPage: null })
  },

  rotatePage: (pageNum: number) => {
    const { rotations } = get()
    const newRotations = [...rotations]
    newRotations[pageNum - 1] = (newRotations[pageNum - 1] + 90) % 360
    set({ rotations: newRotations })
  },

  addStamp: (pageNum: number, stamp: StampData) => {
    const { stamps } = get()
    const newStamps = stamps.map((s, i) =>
      i === pageNum - 1 ? [...s, stamp] : s,
    )
    set({ stamps: newStamps })
  },

  removeStamp: (pageNum: number, stampId: string) => {
    const { stamps } = get()
    const newStamps = stamps.map((s, i) =>
      i === pageNum - 1 ? s.filter((st) => st.id !== stampId) : s,
    )
    set({ stamps: newStamps })
  },

  // ============================================================
  // 一括分割モード
  // ============================================================
  setSplitMode: (mode: boolean) => set({ splitMode: mode }),

  toggleSplitCutPoint: (afterPage: number) => {
    const { splitCutPoints } = get()
    const next = new Set(splitCutPoints)
    if (next.has(afterPage)) {
      next.delete(afterPage)
    } else {
      next.add(afterPage)
    }
    set({ splitCutPoints: next })
  },

  clearSplitCutPoints: () => set({ splitCutPoints: new Set() }),

  // ============================================================
  // UI
  // ============================================================
  setThumbnailSizeLevel: (level: ThumbnailSizeLevel) => set({ thumbnailSizeLevel: level }),

  setAppView: (view: AppView) => set({ appView: view }),

  setPreviewPageNum: (n: number) => set({ previewPageNum: n }),

  setFileName: (name: string) => set({ fileName: name }),

  reset: () => {
    set({
      fileName: '',
      fileSize: 0,
      pageCount: 0,
      thumbnails: [],
      loadProgress: 0,
      rotations: [],
      stamps: [],
      selectedPages: new Set(),
      lastClickedPage: null,
      splitMode: false,
      splitCutPoints: new Set(),
      status: '',
      isLoading: false,
      appView: 'viewer',
      previewPageNum: 1,
      pdfArrayBuffer: null,
    })
  },
}))
