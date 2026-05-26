/**
 * IndexedDB を使った作業状態の自動保存
 *
 * 保存対象:
 * - PDF の元バイト列（ArrayBuffer）
 * - ファイル名
 * - 全ページの回転状態
 * - 全ページのテキストメモ
 *
 * 設計:
 * - ローカル完結（一切ネットワーク通信なし）
 * - 1セッションぶんのみ保持（次回開始時に復元提案）
 * - 大容量PDF（数百MB）にも対応するため Blob/ArrayBuffer を直接格納
 */

import type { StampData } from '../stores/usePdfStore'

const DB_NAME = 'pdfnote-store'
const DB_VERSION = 1
const STORE_NAME = 'session'
const SESSION_KEY = 'current'

export interface SavedSession {
  fileName: string
  fileSize: number
  pageCount: number
  rotations: number[]
  stamps: StampData[][]
  pdfBytes: ArrayBuffer
  savedAt: number  // unix ms
}

// ====================================================================
// IndexedDB 初期化
// ====================================================================

let dbPromise: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// ====================================================================
// 保存/読み込み API
// ====================================================================

/** セッションを丸ごと保存（PDF bytes + 編集状態） */
export const saveSession = async (session: SavedSession): Promise<void> => {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(session, SESSION_KEY)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    // ストレージ容量超過などはサイレントに無視（保存失敗は致命的ではない）
    console.warn('IndexedDB保存に失敗:', err)
  }
}

/** 編集状態のみ更新（PDF bytes は触らない、軽量更新） */
export const updateSessionEdits = async (
  rotations: number[],
  stamps: StampData[][],
): Promise<void> => {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(SESSION_KEY)
      getReq.onsuccess = () => {
        const existing = getReq.result as SavedSession | undefined
        if (!existing) {
          resolve()
          return
        }
        const updated: SavedSession = {
          ...existing,
          rotations,
          stamps,
          savedAt: Date.now(),
        }
        const putReq = store.put(updated, SESSION_KEY)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      getReq.onerror = () => reject(getReq.error)
    })
  } catch (err) {
    console.warn('IndexedDB編集状態の保存に失敗:', err)
  }
}

/** 保存されたセッションを読み込む（なければ null） */
export const loadSession = async (): Promise<SavedSession | null> => {
  try {
    const db = await openDb()
    return await new Promise<SavedSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(SESSION_KEY)
      req.onsuccess = () => resolve((req.result as SavedSession) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('IndexedDB読み込みに失敗:', err)
    return null
  }
}

/** 保存セッションを削除（作業完了時） */
export const clearSession = async (): Promise<void> => {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(SESSION_KEY)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('IndexedDBクリアに失敗:', err)
  }
}

// ====================================================================
// debounce 用ユーティリティ
// ====================================================================

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** 編集状態の保存をデバウンスして呼ぶ（短時間に何度も呼ばれても1回にまとめる） */
export const debouncedUpdateEdits = (
  rotations: number[],
  stamps: StampData[][],
  delayMs = 1000,
): void => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    updateSessionEdits(rotations, stamps)
    saveTimer = null
  }, delayMs)
}
