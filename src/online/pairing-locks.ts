import {
  onDisconnect,
  ref,
  runTransaction,
  type Database,
} from 'firebase/database'

export interface PairingLock {
  readonly hostUid: string
  readonly guestUid: string
  readonly hostTicketId: string
  readonly guestTicketId: string
  readonly matchId: string
  readonly createdAt: number
  readonly expiresAt: number
}

export function pairingLockPath(ticketId: string): string {
  return `pairing/locks/${ticketId}`
}

export function createPairingMatchId(hostTicketId: string, guestTicketId: string): string {
  return `match-${hostTicketId}-${guestTicketId}`
}

function parsePairingLockValue(value: unknown): PairingLock | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const candidate = value as Partial<PairingLock>
  if (
    typeof candidate.hostUid !== 'string'
    || typeof candidate.guestUid !== 'string'
    || typeof candidate.hostTicketId !== 'string'
    || typeof candidate.guestTicketId !== 'string'
    || typeof candidate.matchId !== 'string'
    || typeof candidate.createdAt !== 'number'
    || typeof candidate.expiresAt !== 'number'
  ) return null
  return candidate as PairingLock
}

export function parsePairingLock(value: unknown): PairingLock | null {
  return parsePairingLockValue(value)
}

async function releaseOnePairingLock(database: Database, path: string, matchId: string): Promise<void> {
  const lockRef = ref(database, path)
  await onDisconnect(lockRef).cancel().catch(() => undefined)
  await runTransaction(lockRef, (current) => {
    const lock = parsePairingLockValue(current)
    return lock?.matchId === matchId ? null : current
  })
}

export async function releasePairingLocks(database: Database, paths: readonly string[], matchId: string): Promise<void> {
  await Promise.all(paths.map((path) => releaseOnePairingLock(database, path, matchId).catch(() => undefined)))
}

/**
 * 以固定順序鎖定甲乙兩張票，避免同一玩家同時被配進兩組 match。
 * 任何一張票已被別組鎖定時，整組鎖定失敗並釋放已取得的鎖。
 */
export async function acquirePairingLocks(
  database: Database,
  lock: PairingLock,
): Promise<readonly string[]> {
  if (lock.hostTicketId === lock.guestTicketId || lock.hostUid === lock.guestUid) return []
  const orderedTicketIds = [lock.hostTicketId, lock.guestTicketId].sort((left, right) => left.localeCompare(right))
  const acquiredPaths: string[] = []
  try {
    for (const ticketId of orderedTicketIds) {
      const path = pairingLockPath(ticketId)
      const result = await runTransaction(ref(database, path), (current) => {
        const currentLock = parsePairingLockValue(current)
        if (currentLock !== null && currentLock.expiresAt > Date.now()) return
        return lock
      })
      if (!result.committed) {
        await releasePairingLocks(database, acquiredPaths, lock.matchId)
        return []
      }
      acquiredPaths.push(path)
      await onDisconnect(ref(database, path)).remove()
    }
    return acquiredPaths
  } catch (error) {
    await releasePairingLocks(database, acquiredPaths, lock.matchId)
    throw error
  }
}
