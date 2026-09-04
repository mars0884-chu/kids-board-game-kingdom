import type { DifficultyLevel } from '../../components/common-ui'
import { deserializeNumberGemState, serializeNumberGemState, type NumberGemState } from './rules'
import { createInitialNumberGemScore, normalizeNumberGemScore, type NumberGemScore } from './score'

export type NumberGemMode = 'adventure' | 'npc' | 'local'

export interface NumberGemSession {
  difficulty: DifficultyLevel
  hintLevel: number
  state: NumberGemState
  tutorialStep: number
  roundSeed: number
  localPlayer: 1 | 2
  score: NumberGemScore
}

export interface NumberGemStorage {
  clear(mode: NumberGemMode): Promise<void>
  load(mode: NumberGemMode): Promise<NumberGemSession | null>
  save(mode: NumberGemMode, session: NumberGemSession): Promise<void>
}

interface StoredNumberGemSession {
  difficulty: DifficultyLevel
  hintLevel: number
  serializedState: string
  tutorialStep: number
  roundSeed: number
  localPlayer: 1 | 2
  score?: unknown
}

const DATABASE_NAME = 'kids-board-game-kingdom'
const DATABASE_VERSION = 1
const STORE_NAME = 'game-sessions'

function isDifficulty(value: unknown): value is DifficultyLevel {
  return value === 'beginner' || value === 'growth' || value === 'challenge' || value === 'adult'
}

function isStoredSession(value: unknown): value is StoredNumberGemSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const session = value as Record<string, unknown>
  return isDifficulty(session.difficulty)
    && Number.isInteger(session.hintLevel)
    && typeof session.hintLevel === 'number'
    && session.hintLevel >= 0
    && session.hintLevel <= 4
    && Number.isInteger(session.tutorialStep)
    && typeof session.tutorialStep === 'number'
    && session.tutorialStep >= 0
    && session.tutorialStep <= 4
    && Number.isInteger(session.roundSeed)
    && typeof session.roundSeed === 'number'
    && (session.localPlayer === 1 || session.localPlayer === 2)
    && typeof session.serializedState === 'string'
    && (session.score === undefined || normalizeNumberGemScore(session.score) !== null)
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true })
    transaction.addEventListener('error', () => reject(transaction.error), { once: true })
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
}

function storageKey(mode: NumberGemMode): string {
  return `number-gem:${mode}`
}

export const indexedDbNumberGemStorage: NumberGemStorage = {
  async load(mode) {
    if (!('indexedDB' in window)) return null
    try {
      const database = await openDatabase()
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const stored = await requestResult(transaction.objectStore(STORE_NAME).get(storageKey(mode)))
      await transactionDone(transaction)
      database.close()
      if (!isStoredSession(stored)) return null
      return {
        difficulty: stored.difficulty,
        hintLevel: stored.hintLevel,
        state: deserializeNumberGemState(stored.serializedState),
        tutorialStep: stored.tutorialStep,
        roundSeed: stored.roundSeed,
        localPlayer: stored.localPlayer,
        score: normalizeNumberGemScore(stored.score) ?? createInitialNumberGemScore(),
      }
    } catch {
      return null
    }
  },

  async save(mode, session) {
    if (!('indexedDB' in window)) return
    try {
      const database = await openDatabase()
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put({
        difficulty: session.difficulty,
        hintLevel: session.hintLevel,
        serializedState: serializeNumberGemState(session.state),
        tutorialStep: session.tutorialStep,
        roundSeed: session.roundSeed,
        localPlayer: session.localPlayer,
        score: session.score,
      } satisfies StoredNumberGemSession, storageKey(mode))
      await transactionDone(transaction)
      database.close()
    } catch {
      // 存檔失敗不可中斷兒童當前對局；下一次操作會再嘗試寫入。
    }
  },

  async clear(mode) {
    if (!('indexedDB' in window)) return
    try {
      const database = await openDatabase()
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(storageKey(mode))
      await transactionDone(transaction)
      database.close()
    } catch {
      // 清除失敗時仍可用新的記憶體局面繼續遊玩。
    }
  },
}
