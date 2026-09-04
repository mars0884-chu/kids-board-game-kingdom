import { deserializeAnimalChessState, serializeAnimalChessState, type AnimalChessState } from './rules'

export type AnimalChessMode = 'adventure' | 'npc' | 'local'

export interface AnimalChessSession {
  difficulty: 'beginner' | 'growth' | 'challenge' | 'adult'
  tutorialStep: number
  tutorialSubstep: number
  tutorialComplete: boolean
  state: AnimalChessState
}

interface StoredAnimalChessSession {
  difficulty: AnimalChessSession['difficulty']
  tutorialStep: number
  tutorialSubstep?: number
  tutorialComplete?: boolean
  serializedState: string
}

const DATABASE_NAME = 'kids-board-game-kingdom'
const DATABASE_VERSION = 1
const STORE_NAME = 'game-sessions'

function isDifficulty(value: unknown): value is AnimalChessSession['difficulty'] {
  return value === 'beginner' || value === 'growth' || value === 'challenge' || value === 'adult'
}

function isStoredSession(value: unknown): value is StoredAnimalChessSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const session = value as Record<string, unknown>
  return isDifficulty(session.difficulty)
    && typeof session.tutorialStep === 'number'
    && Number.isInteger(session.tutorialStep)
    && session.tutorialStep >= 0
    && session.tutorialStep <= 5
    && (session.tutorialSubstep === undefined || (typeof session.tutorialSubstep === 'number' && Number.isInteger(session.tutorialSubstep) && session.tutorialSubstep >= 0 && session.tutorialSubstep <= 1))
    && (session.tutorialComplete === undefined || typeof session.tutorialComplete === 'boolean')
    && typeof session.serializedState === 'string'
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
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
}

function storageKey(mode: AnimalChessMode): string {
  return `animal-chess:${mode}`
}

export interface AnimalChessStorage {
  clear(mode: AnimalChessMode): Promise<void>
  load(mode: AnimalChessMode): Promise<AnimalChessSession | null>
  save(mode: AnimalChessMode, session: AnimalChessSession): Promise<void>
}

export const indexedDbAnimalChessStorage: AnimalChessStorage = {
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
        tutorialStep: stored.tutorialStep,
        tutorialSubstep: stored.tutorialSubstep ?? 0,
        tutorialComplete: stored.tutorialComplete ?? false,
        state: deserializeAnimalChessState(stored.serializedState),
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
        tutorialStep: session.tutorialStep,
        tutorialSubstep: session.tutorialSubstep,
        tutorialComplete: session.tutorialComplete,
        serializedState: serializeAnimalChessState(session.state),
      } satisfies StoredAnimalChessSession, storageKey(mode))
      await transactionDone(transaction)
      database.close()
    } catch {
      // 存檔失敗不打斷目前對局，下一次操作會再嘗試。
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
      // 清除失敗仍可用新的記憶體局面繼續遊玩。
    }
  },
}
