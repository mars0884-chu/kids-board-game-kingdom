import { XIANGQI_TUTORIAL_LEVELS } from './adventure'

export interface XiangqiAdventureSession {
  readonly levelIndex: number
  readonly taskIndex: number
  readonly hintLevel: number
  readonly completedLevelIds: readonly string[]
  readonly moveComplete: boolean
  readonly courseComplete: boolean
}

export interface XiangqiAdventureStorage {
  load(): Promise<XiangqiAdventureSession | null>
  save(session: XiangqiAdventureSession): Promise<void>
  clear(): Promise<void>
}

const DATABASE_NAME = 'kids-board-game-kingdom'
const DATABASE_VERSION = 1
const STORE_NAME = 'game-sessions'
const STORAGE_KEY = 'xiangqi:adventure'

export function isXiangqiAdventureSession(value: unknown): value is XiangqiAdventureSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const session = value as Record<string, unknown>
  const levelIndex = session.levelIndex
  const taskIndex = session.taskIndex
  const hintLevel = session.hintLevel
  const completedLevelIds = session.completedLevelIds
  return typeof levelIndex === 'number' && Number.isInteger(levelIndex) && levelIndex >= 0 && levelIndex < XIANGQI_TUTORIAL_LEVELS.length &&
    typeof taskIndex === 'number' && Number.isInteger(taskIndex) && taskIndex >= 0 && taskIndex < XIANGQI_TUTORIAL_LEVELS[levelIndex]!.tasks.length &&
    typeof hintLevel === 'number' && Number.isInteger(hintLevel) && hintLevel >= 0 && hintLevel <= 3 &&
    Array.isArray(completedLevelIds) && completedLevelIds.every((id) => typeof id === 'string' && XIANGQI_TUTORIAL_LEVELS.some((level) => level.id === id)) &&
    typeof session.moveComplete === 'boolean' && typeof session.courseComplete === 'boolean'
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

export const indexedDbXiangqiAdventureStorage: XiangqiAdventureStorage = {
  async load() {
    if (!('indexedDB' in window)) return null
    try {
      const database = await openDatabase()
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const value = await requestResult(transaction.objectStore(STORE_NAME).get(STORAGE_KEY))
      await transactionDone(transaction)
      database.close()
      return isXiangqiAdventureSession(value) ? value : null
    } catch {
      return null
    }
  },
  async save(session) {
    if (!('indexedDB' in window)) return
    try {
      const database = await openDatabase()
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(session, STORAGE_KEY)
      await transactionDone(transaction)
      database.close()
    } catch { /* 存檔失敗不可阻斷教學操作。 */ }
  },
  async clear() {
    if (!('indexedDB' in window)) return
    try {
      const database = await openDatabase()
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(STORAGE_KEY)
      await transactionDone(transaction)
      database.close()
    } catch { /* 清除失敗時仍可從目前課程重新開始。 */ }
  },
}
