import type { DifficultyLevel } from '../../components/common-ui'
import {
  deserializeTicTacToeState,
  serializeTicTacToeState,
  type TicTacToeState,
} from './rules'

export type TicTacToeMode = 'tutorial' | 'npc' | 'local'

export interface TicTacToeSession {
  difficulty: DifficultyLevel
  hintLevel: number
  state: TicTacToeState
  tutorialStep: number
}

export interface TicTacToeStorage {
  clear(mode: TicTacToeMode): Promise<void>
  load(mode: TicTacToeMode): Promise<TicTacToeSession | null>
  save(mode: TicTacToeMode, session: TicTacToeSession): Promise<void>
}

interface StoredTicTacToeSession {
  difficulty: DifficultyLevel
  hintLevel: number
  serializedState: string
  tutorialStep: number
}

const DATABASE_NAME = 'kids-board-game-kingdom'
const DATABASE_VERSION = 1
const STORE_NAME = 'game-sessions'

function isDifficulty(value: unknown): value is DifficultyLevel {
  return value === 'beginner' || value === 'growth' || value === 'challenge' || value === 'adult'
}

function isStoredSession(value: unknown): value is StoredTicTacToeSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const session = value as Record<string, unknown>
  return isDifficulty(session.difficulty) &&
    Number.isInteger(session.hintLevel) &&
    typeof session.hintLevel === 'number' &&
    session.hintLevel >= 0 &&
    session.hintLevel <= 4 &&
    Number.isInteger(session.tutorialStep) &&
    typeof session.tutorialStep === 'number' &&
    session.tutorialStep >= 0 &&
    session.tutorialStep <= 3 &&
    typeof session.serializedState === 'string'
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

function storageKey(mode: TicTacToeMode): string {
  return `tictactoe:${mode}`
}

export const indexedDbTicTacToeStorage: TicTacToeStorage = {
  async load(mode) {
    if (!('indexedDB' in window)) {
      return null
    }

    try {
      const database = await openDatabase()
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const stored = await requestResult(transaction.objectStore(STORE_NAME).get(storageKey(mode)))
      await transactionDone(transaction)
      database.close()

      if (!isStoredSession(stored)) {
        return null
      }

      return {
        difficulty: stored.difficulty,
        hintLevel: stored.hintLevel,
        state: deserializeTicTacToeState(stored.serializedState),
        tutorialStep: stored.tutorialStep,
      }
    } catch {
      return null
    }
  },

  async save(mode, session) {
    if (!('indexedDB' in window)) {
      return
    }

    try {
      const database = await openDatabase()
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put({
        difficulty: session.difficulty,
        hintLevel: session.hintLevel,
        serializedState: serializeTicTacToeState(session.state),
        tutorialStep: session.tutorialStep,
      } satisfies StoredTicTacToeSession, storageKey(mode))
      await transactionDone(transaction)
      database.close()
    } catch {
      // 存檔失敗不可中斷兒童當前對局；下次操作會再嘗試寫入。
    }
  },

  async clear(mode) {
    if (!('indexedDB' in window)) {
      return
    }

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
