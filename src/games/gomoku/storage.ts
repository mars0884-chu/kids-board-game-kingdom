import type { DifficultyLevel } from '../../components/common-ui'
import { deserializeGomokuState, serializeGomokuState, type GomokuState } from './rules'

export type GomokuMode = 'adventure' | 'npc' | 'local'

export interface GomokuAdventureProgress {
  readonly selectedLevelId: string
  readonly completedLevelIds: readonly string[]
}

export interface GomokuSession {
  difficulty: DifficultyLevel
  hintLevel: number
  state: GomokuState
  tutorialStep: number
  adventureProgress?: GomokuAdventureProgress
}

export interface GomokuStorage {
  clear(mode: GomokuMode): Promise<void>
  load(mode: GomokuMode): Promise<GomokuSession | null>
  save(mode: GomokuMode, session: GomokuSession): Promise<void>
}

interface StoredGomokuSession {
  difficulty: DifficultyLevel
  hintLevel: number
  serializedState: string
  tutorialStep: number
  adventureProgress?: GomokuAdventureProgress
}

const databaseName = 'kids-board-game-kingdom'
const databaseVersion = 1
const storeName = 'game-sessions'

function isDifficulty(value: unknown): value is DifficultyLevel {
  return value === 'beginner' || value === 'growth' || value === 'challenge' || value === 'adult'
}

function isAdventureProgress(value: unknown): value is GomokuAdventureProgress {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const progress = value as Record<string, unknown>
  return typeof progress.selectedLevelId === 'string' &&
    progress.selectedLevelId.length > 0 &&
    Array.isArray(progress.completedLevelIds) &&
    progress.completedLevelIds.every((levelId) => typeof levelId === 'string')
}

function isStoredSession(value: unknown): value is StoredGomokuSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const session = value as Record<string, unknown>
  return isDifficulty(session.difficulty) &&
    typeof session.hintLevel === 'number' && Number.isInteger(session.hintLevel) && session.hintLevel >= 0 && session.hintLevel <= 4 &&
    typeof session.tutorialStep === 'number' && Number.isInteger(session.tutorialStep) && session.tutorialStep >= 0 && session.tutorialStep <= 5 &&
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

function storageKey(mode: GomokuMode): string {
  return `gomoku:${mode}`
}

export const indexedDbGomokuStorage: GomokuStorage = {
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
        state: deserializeGomokuState(stored.serializedState),
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
        serializedState: serializeGomokuState(session.state),
        tutorialStep: session.tutorialStep,
        adventureProgress: session.adventureProgress,
      } satisfies StoredGomokuSession, storageKey(mode))
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
