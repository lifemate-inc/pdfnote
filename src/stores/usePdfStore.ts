import { create } from 'zustand'
import { loadPdfDocument, generateThumbnail } from '../lib/pdfLoader'
import { saveSession, debouncedUpdateEdits, clearSession } from '../lib/persistence'

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
// Undo/Redo 履歴
// ============================================================

interface EditSnapshot {
  rotations: number[]
  stamps: StampData[][]
}

const MAX_HISTORY = 50

/** undo スタックに現在の編集状態を追加（rotate/stamp変更前に呼ぶ） */
const pushUndo = (
  get: () => PdfState,
  set: (partial: Partial<PdfState>) => void,
) => {
  const { rotations, stamps, undoStack } = get()
  const snapshot: EditSnapshot = {
    rotations: [...rotations],
    stamps: stamps.map((s) => [...s]),
  }
  const newStack = [...undoStack, snapshot]
  if (newStack.length > MAX_HISTORY) newStack.shift()
  set({ undoStack: newStack, redoStack: [] })
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

  // Undo/Redo 履歴
  undoStack: EditSnapshot[]
  redoStack: EditSnapshot[]

  // ============================================================
  // アクション
  // ============================================================
  loadPdf: (file: File) => Promise<void>
  restoreSession: (session: import('../lib/persistence').SavedSession) => Promise<void>
  discardSavedSession: () => Promise<void>
  togglePage: (pageNum: number, shiftKey: boolean, ctrlKey: boolean) => void
  selectAll: () => void
  clearSelection: () => void
  rotatePage: (pageNum: number) => void
  addStamp: (pageNum: number, stamp: StampData) => void
  removeStamp: (pageNum: number, stampId: string) => void
  updateStamp: (pageNum: number, stampId: string, updates: Partial<Omit<StampData, 'id'>>) => void
  setThumbnailSizeLevel: (level: ThumbnailSizeLevel) => void
  setAppView: (view: AppView) => void
  setPreviewPageNum: (n: number) => void
  setFileName: (name: string) => void
  setSplitMode: (mode: boolean) => void
  toggleSplitCutPoint: (afterPage: number) => void
  clearSplitCutPoints: () => void
  undo: () => void
  redo: () => void
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
  undoStack: [],
  redoStack: [],

  // ============================================================
  // PDF 読み込み
  // ============================================================
  loadPdf: async (file: File) => {
    // 1. 前のPDFのstate参照を完全に解放（バッファ・サムネイル等）
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
      rotations: [],
      stamps: [],
      pdfArrayBuffer: null,  // 旧バッファ参照を解放
      undoStack: [],
      redoStack: [],
      appView: 'viewer',
      previewPageNum: 1,
    })

    try {
      const arrayBuffer = await file.arrayBuffer()
      const bufferForPdfJs = arrayBuffer.slice(0)
      const bufferForPdfLib = arrayBuffer.slice(0)

      // loadPdfDocument 内で旧 _currentPdf が destroy される
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
        const dataUrl = await generateThumbnail(pdf, i, 1.0)
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

      // IndexedDB に PDF 本体を保存（後で復元できるよう）
      saveSession({
        fileName: file.name,
        fileSize: file.size,
        pageCount: pdf.numPages,
        rotations: new Array(pdf.numPages).fill(0),
        stamps: Array.from({ length: pdf.numPages }, () => []),
        pdfBytes: bufferForPdfLib.slice(0),
        savedAt: Date.now(),
      }).catch(() => { /* 失敗は無視 */ })
    } catch (err) {
      set({
        isLoading: false,
        status: `エラー: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  },

  /**
   * 保存済みセッションから復元する（IndexedDB → state）
   */
  restoreSession: async (session) => {
    set({
      isLoading: true,
      status: '前回の作業を復元中...',
      thumbnails: [],
      loadProgress: 0,
      selectedPages: new Set(),
      lastClickedPage: null,
      splitMode: false,
      splitCutPoints: new Set(),
      appView: 'viewer',
      previewPageNum: 1,
    })

    try {
      const bufferForPdfJs = session.pdfBytes.slice(0)
      const bufferForPdfLib = session.pdfBytes.slice(0)

      const pdf = await loadPdfDocument(bufferForPdfJs)

      set({
        fileName: session.fileName,
        fileSize: session.fileSize,
        pageCount: pdf.numPages,
        pdfArrayBuffer: bufferForPdfLib,
        rotations: session.rotations,
        stamps: session.stamps,
        status: `復元中... サムネイル生成 (0/${pdf.numPages})`,
      })

      const thumbnails: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const dataUrl = await generateThumbnail(pdf, i, 1.0)
        thumbnails.push(dataUrl)
        if (i % 8 === 0 || i === pdf.numPages) {
          set({
            thumbnails: [...thumbnails],
            loadProgress: Math.round((i / pdf.numPages) * 100),
            status: `復元中... サムネイル生成 (${i}/${pdf.numPages})`,
          })
          await new Promise((r) => setTimeout(r, 0))
        }
      }

      set({
        isLoading: false,
        status: `前回の作業を復元しました（${pdf.numPages} ページ）`,
        loadProgress: 100,
      })
    } catch (err) {
      set({
        isLoading: false,
        status: `復元エラー: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  },

  /** IndexedDB の保存セッションを破棄（作業完了時など） */
  discardSavedSession: async () => {
    await clearSession()
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
    const { rotations, stamps } = get()
    pushUndo(get, set)
    const newRotations = [...rotations]
    newRotations[pageNum - 1] = (newRotations[pageNum - 1] + 90) % 360
    set({ rotations: newRotations })
    debouncedUpdateEdits(newRotations, stamps)
  },

  addStamp: (pageNum: number, stamp: StampData) => {
    const { stamps, rotations } = get()
    pushUndo(get, set)
    const newStamps = stamps.map((s, i) =>
      i === pageNum - 1 ? [...s, stamp] : s,
    )
    set({ stamps: newStamps })
    debouncedUpdateEdits(rotations, newStamps)
  },

  removeStamp: (pageNum: number, stampId: string) => {
    const { stamps, rotations } = get()
    pushUndo(get, set)
    const newStamps = stamps.map((s, i) =>
      i === pageNum - 1 ? s.filter((st) => st.id !== stampId) : s,
    )
    set({ stamps: newStamps })
    debouncedUpdateEdits(rotations, newStamps)
  },

  updateStamp: (pageNum: number, stampId: string, updates: Partial<Omit<StampData, 'id'>>) => {
    const { stamps, rotations } = get()
    pushUndo(get, set)
    const newStamps = stamps.map((s, i) =>
      i === pageNum - 1
        ? s.map((st) => (st.id === stampId ? { ...st, ...updates } : st))
        : s,
    )
    set({ stamps: newStamps })
    debouncedUpdateEdits(rotations, newStamps)
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
  // Undo / Redo
  // ============================================================
  undo: () => {
    const { undoStack, redoStack, rotations, stamps } = get()
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    const current: EditSnapshot = {
      rotations: [...rotations],
      stamps: stamps.map((s) => [...s]),
    }
    set({
      rotations: previous.rotations,
      stamps: previous.stamps,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, current],
    })
    debouncedUpdateEdits(previous.rotations, previous.stamps)
  },

  redo: () => {
    const { undoStack, redoStack, rotations, stamps } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    const current: EditSnapshot = {
      rotations: [...rotations],
      stamps: stamps.map((s) => [...s]),
    }
    set({
      rotations: next.rotations,
      stamps: next.stamps,
      undoStack: [...undoStack, current],
      redoStack: redoStack.slice(0, -1),
    })
    debouncedUpdateEdits(next.rotations, next.stamps)
  },

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
      undoStack: [],
      redoStack: [],
    })
  },
}))
