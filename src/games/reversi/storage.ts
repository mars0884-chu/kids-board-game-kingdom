import type { DifficultyLevel } from '../../components/common-ui'
import { deserializeReversiState, serializeReversiState, type ReversiState } from './rules'

export type ReversiMode = 'adventure' | 'npc' | 'local'

export interface ReversiSession {
  readonly difficulty: DifficultyLevel
  readonly hintLevel: number
  readonly seed: number
  readonly state: ReversiState
  readonly tutorialStep: number
  readonly adventureProgress?: {
    readonly selectedLevelId: string
    readonly completedLevelIds: readonly string[]
  }
}

export interface ReversiStorage {
  clear(mode: ReversiMode): Promise<void>
  load(mode: ReversiMode): Promise<ReversiSession | null>
  save(mode: ReversiMode, session: ReversiSession): Promise<void>
}

interface StoredReversiSession extends Omit<ReversiSession, 'state'> {
  readonly serializedState: string
}

const databaseName = 'kids-board-game-kingdom'
const databaseVersion = 1
const storeName = 'game-sessions'

function isDifficulty(value: unknown): value is DifficultyLevel {
  return value === 'beginner' || value === 'growth' || value === 'challenge' || value === 'adult'
}

function isAdventureProgress(value: unknown): value is NonNullable<ReversiSession['adventureProgress']> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const progress = value as Record<string, unknown>
  return typeof progress.selectedLevelId === 'string' && progress.selectedLevelId.length > 0 &&
    Array.isArray(progress.completedLevelIds) && progress.completedLevelIds.every((id) => typeof id === 'string')
}

function isStoredSession(value: unknown): value is StoredReversiSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const session = value as Record<string, unknown>
  return isDifficulty(session.difficulty) &&
    typeof session.hintLevel === 'number' && Number.isInteger(session.hintLevel) && session.hintLevel >= 0 && session.hintLevel <= 4 &&
    typeof session.seed === 'number' && Number.isInteger(session.seed) &&
    typeof session.tutorialStep === 'number' && Number.isInteger(session.tutorialStep) && session.tutorialStep >= 0 && session.tutorialStep <= 6 &&
    (session.adventureProgress === undefined || isAdventureProgress(session.adventureProgress)) &&
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
    const request = window.indexedDB.open(databaseName, databaseVersion)
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName)
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
}

function storageKey(mode: ReversiMode): string {
  return `reversi:${mode}`
}

export const indexedDbReversiStorage: ReversiStorage = {
  async load(mode) {
    if (!('indexedDB' in window)) return null
    try {
      const database = await openDatabase()
      const transaction = database.transaction(storeName, 'readonly')
      const stored = await requestResult(transaction.objectStore(storeName).get(storageKey(mode)))
      await transactionDone(transaction)
      database.close()
      if (!isStoredSession(stored)) return null
      return {
        difficulty: stored.difficulty,
        hintLevel: stored.hintLevel,
        seed: stored.seed,
        state: deserializeReversiState(stored.serializedState),
        tutorialStep: stored.tutorialStep,
        adventureProgress: stored.adventureProgress,
      }
    } catch {
      return null
    }
  },
  async save(mode, session) {
    if (!('indexedDB' in window)) return
    try {
      const database = await openDatabase()
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put({
        difficulty: session.difficulty,
        hintLevel: session.hintLevel,
        seed: session.seed,
        serializedState: serializeReversiState(session.state),
        tutorialStep: session.tutorialStep,
        adventureProgress: session.adventureProgress,
      } satisfies StoredReversiSession, storageKey(mode))
      await transactionDone(transaction)
      database.close()
    } catch { /* 存檔不可阻斷遊戲。 */ }
  },
  async clear(mode) {
    if (!('indexedDB' in window)) return
    try {
      const database = await openDatabase()
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).delete(storageKey(mode))
      await transactionDone(transaction)
      database.close()
    } catch { /* 清除失敗時保留既有局面。 */ }
  },
}
