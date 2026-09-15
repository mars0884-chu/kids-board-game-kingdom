import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, type User } from 'firebase/auth'
import {
  getDatabase,
  get,
  limitToFirst,
  onDisconnect,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  startAt,
  type Database,
  type DataSnapshot,
} from 'firebase/database'
import type { WebRtcSignal } from './webrtc'
import { createFirebaseGameSession, type FirebaseGameSession } from './firebase-game'
import { acquirePairingLocks, createPairingMatchId, pairingLockPath, parsePairingLock, releasePairingLocks } from './pairing-locks'

export const FIREBASE_PAIRING_WAIT_TIMEOUT_MS = 2 * 60 * 1000
export const FIREBASE_PAIRING_MATCH_TIMEOUT_MS = 5 * 60 * 1000

type FirebaseConfig = {
  readonly apiKey: string
  readonly authDomain: string
  readonly databaseURL: string
  readonly projectId: string
  readonly storageBucket: string
  readonly messagingSenderId: string
  readonly appId: string
}

const firebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

const configKeys: readonly (keyof FirebaseConfig)[] = [
  'apiKey',
  'authDomain',
  'databaseURL',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
]

interface FirebaseServices {
  readonly app: FirebaseApp
  readonly database: Database
  readonly user: User
}

interface PairingTicket {
  readonly transport?: 'firebase-board-v1'
  readonly uid: string
  readonly state: 'waiting' | 'matched'
  readonly createdAt: number
  readonly expiresAt: number
  readonly matchedTicketId?: string
  readonly matchId?: string
}

interface PairingClaim {
  readonly uid: string
  readonly ticketId: string
  readonly createdAt: number
  readonly expiresAt: number
}

interface PairingMatch {
  readonly hostUid: string
  readonly guestUid: string
  readonly hostTicketId: string
  readonly guestTicketId: string
  readonly createdAt: number
  readonly expiresAt: number
}

export interface FirebasePairingSession {
  readonly uid: string
  readonly ticketId: string
  readonly matchId: string
  readonly role: 'host' | 'guest'
  createGame(signal: AbortSignal): Promise<FirebaseGameSession>
  publishOffer(signal: WebRtcSignal): Promise<void>
  publishAnswer(signal: WebRtcSignal): Promise<void>
  waitForOffer(timeoutMs?: number): Promise<WebRtcSignal>
  waitForAnswer(timeoutMs?: number): Promise<WebRtcSignal>
  cancel(): Promise<void>
  report(): Promise<void>
  block(): Promise<void>
}

let servicesPromise: Promise<FirebaseServices> | null = null

const BLOCKED_UIDS_STORAGE_KEY = 'kids-board-game.firebase-pairing.blocked-uids'

function readBlockedUids(): Set<string> {
  try {
    const raw = localStorage.getItem(BLOCKED_UIDS_STORAGE_KEY)
    if (raw === null) return new Set()
    const value: unknown = JSON.parse(raw)
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeBlockedUids(blockedUids: Set<string>): void {
  try {
    localStorage.setItem(BLOCKED_UIDS_STORAGE_KEY, JSON.stringify([...blockedUids]))
  } catch {
    // 被瀏覽器封鎖時仍可離開配對，不影響棋局安全。
  }
}

export function isFirebasePairingConfigured(): boolean {
  return configKeys.every((key) => firebaseConfig[key].trim().length > 0)
}

function getFirebaseServices(): Promise<FirebaseServices> {
  if (!isFirebasePairingConfigured()) {
    return Promise.reject(new Error('隨機配對尚未設定 Firebase。'))
  }
  if (servicesPromise !== null) return servicesPromise

  servicesPromise = (async () => {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
    const auth = getAuth(app)
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user
    return { app, database: getDatabase(app), user }
  })().catch((error) => { servicesPromise = null; throw error })
  return servicesPromise
}

function parseTicket(snapshot: DataSnapshot): PairingTicket | null {
  const value = snapshot.val() as Partial<PairingTicket> | null
  if (value === null || typeof value !== 'object') return null
  if (typeof value.uid !== 'string' || typeof value.state !== 'string') return null
  if (value.state !== 'waiting' && value.state !== 'matched') return null
  if (typeof value.createdAt !== 'number' || typeof value.expiresAt !== 'number') return null
  return value as PairingTicket
}

function parseClaim(snapshot: DataSnapshot): PairingClaim | null {
  const value = snapshot.val() as Partial<PairingClaim> | null
  if (value === null || typeof value !== 'object') return null
  if (typeof value.uid !== 'string' || typeof value.ticketId !== 'string') return null
  if (typeof value.createdAt !== 'number' || typeof value.expiresAt !== 'number') return null
  return value as PairingClaim
}

function parseMatch(snapshot: DataSnapshot): PairingMatch | null {
  const value = snapshot.val() as Partial<PairingMatch> | null
  if (value === null || typeof value !== 'object') return null
  if (typeof value.hostUid !== 'string' || typeof value.guestUid !== 'string') return null
  if (typeof value.hostTicketId !== 'string' || typeof value.guestTicketId !== 'string') return null
  if (typeof value.createdAt !== 'number' || typeof value.expiresAt !== 'number') return null
  return value as PairingMatch
}

function parseSignal(value: unknown, kind: WebRtcSignal['kind']): WebRtcSignal | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const candidate = value as Partial<WebRtcSignal>
  if (
    candidate.protocol !== 'kids-board-game-webrtc'
    || candidate.version !== 1
    || candidate.kind !== kind
    || typeof candidate.sessionId !== 'string'
    || typeof candidate.createdAt !== 'number'
    || typeof candidate.description !== 'object'
    || candidate.description === null
  ) return null
  const description = candidate.description as Partial<WebRtcSignal['description']>
  if (description.type !== kind || typeof description.sdp !== 'string' || description.sdp.length === 0) return null
  return candidate as WebRtcSignal
}

function waitForSnapshot<T>(
  database: Database,
  path: string,
  parse: (snapshot: DataSnapshot) => T | null,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const target = ref(database, path)
    let settled = false
    let unsubscribe = () => {}
    const abort = () => finish(new Error('配對已取消。'))
    const finish = (error: Error | null, value?: T) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      unsubscribe()
      if (error !== null) reject(error)
      else resolve(value as T)
    }
    const timeout = window.setTimeout(() => {
      finish(new Error('等待隨機配對資料逾時。'))
    }, timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    unsubscribe = onValue(target, (snapshot) => {
      const parsed = parse(snapshot)
      if (parsed !== null) finish(null, parsed)
    }, (error) => finish(error))
    if (settled) unsubscribe()
  })
}

function waitForMatch(database: Database, matchId: string, timeoutMs: number, signal?: AbortSignal): Promise<PairingMatch> {
  return waitForSnapshot(database, `pairing/matches/${matchId}`, parseMatch, timeoutMs, signal)
}

async function claimCandidate(
  database: Database,
  candidateTicketId: string,
  ticketId: string,
  uid: string,
  expiresAt: number,
): Promise<void> {
  const claimRef = ref(database, `pairing/claims/${candidateTicketId}/${ticketId}`)
  await set(claimRef, { uid, ticketId, createdAt: Date.now(), expiresAt } satisfies PairingClaim)
  await onDisconnect(claimRef).remove()
}

function signalPath(matchId: string, kind: 'offer' | 'answer'): string {
  return `pairing/matches/${matchId}/signals/${kind}`
}

// 同一對玩家可能在幾乎同一時間看到彼此。配對票號是隨機且唯一的，
// 只讓排序較前的一端主動提出 claim；收到 claim 的另一端固定成為甲，
// 提出 claim 的一端固定成為乙，避免兩端建立不同的 match。
export function shouldClaimPairingCandidate(ownTicketId: string, candidateTicketId: string): boolean {
  return ownTicketId.localeCompare(candidateTicketId) < 0
}

async function publishSignal(database: Database, matchId: string, signal: WebRtcSignal): Promise<void> {
  await set(ref(database, signalPath(matchId, signal.kind)), signal)
}

function waitForSignal(
  database: Database,
  matchId: string,
  kind: 'offer' | 'answer',
  timeoutMs: number,
): Promise<WebRtcSignal> {
  return waitForSnapshot(database, signalPath(matchId, kind), (snapshot) => parseSignal(snapshot.val(), kind), timeoutMs)
}

export async function joinFirebasePairing(
  onStatus?: (status: 'signing-in' | 'waiting' | 'matched') => void,
  signal?: AbortSignal,
  services?: FirebaseServices,
): Promise<FirebasePairingSession> {
  const { database, user } = services ?? await getFirebaseServices()
  const blockedUids = readBlockedUids()
  onStatus?.('signing-in')

  const ticketRef = push(ref(database, 'pairing/queue'))
  const ticketId = ticketRef.key
  if (ticketId === null) throw new Error('無法建立隨機配對識別碼。')
  const createdAt = Date.now()
  const expiresAt = createdAt + FIREBASE_PAIRING_WAIT_TIMEOUT_MS
  if (signal?.aborted) throw new Error('配對已取消。')
  await set(ticketRef, { uid: user.uid, state: 'waiting', createdAt, expiresAt, transport: 'firebase-board-v1' } satisfies PairingTicket)
  await onDisconnect(ticketRef).remove()
  onStatus?.('waiting')

  let active = true
  const unsubscribeQueue = new Set<() => void>()
  const claimedCandidates = new Set<string>()
  const candidateSubscriptions = new Map<string, () => void>()
  const claimPaths = new Set<string>()
  const lockPaths = new Set<string>()
  let matched: { role: FirebasePairingSession['role']; matchId: string } | null = null
  let resolveMatched: ((value: { role: FirebasePairingSession['role']; matchId: string }) => void) | null = null
  let rejectMatched: ((error: Error) => void) | null = null

  const matchedPromise = new Promise<{ role: FirebasePairingSession['role']; matchId: string }>((resolve, reject) => {
    resolveMatched = resolve
    rejectMatched = reject
  })
  const fail = (error: Error) => {
    if (!active || matched !== null) return
    active = false
    rejectMatched?.(error)
  }
  const resolveMatch = (role: FirebasePairingSession['role'], matchId: string) => {
    if (!active || matched !== null) return
    matched = { role, matchId }
    onStatus?.('matched')
    resolveMatched?.(matched)
  }

  const ownTicketUnsubscribe = onValue(ticketRef, (snapshot) => {
    const ticket = parseTicket(snapshot)
    if (ticket === null) return
    if (ticket.expiresAt <= Date.now()) {
      void remove(ticketRef)
      fail(new Error('等待時間到了，配對已離開。'))
      return
    }
    if (ticket.state === 'matched' && ticket.matchedTicketId !== undefined && ticket.matchId !== undefined) {
      // 甲等待交易由伺服器確認，不以樂觀事件交接。
    }
  }, fail)
  unsubscribeQueue.add(ownTicketUnsubscribe)

  const ownLockUnsubscribe = onValue(ref(database, pairingLockPath(ticketId)), (snapshot) => {
    const lock = parsePairingLock(snapshot.val())
    if (lock?.guestTicketId === ticketId && lock.guestUid === user.uid) {
      lockPaths.add(pairingLockPath(lock.hostTicketId))
      lockPaths.add(pairingLockPath(lock.guestTicketId))
      // 單張鎖不代表兩張鎖完成；等待甲票 matched 的正式通知。
    }
  }, fail)
  unsubscribeQueue.add(ownLockUnsubscribe)

  let claimsInProgress = false
  let latestClaims: readonly PairingClaim[] = []
  let pendingClaims: readonly PairingClaim[] | null = null

  const processClaims = async (claims: readonly PairingClaim[]) => {
    if (claimsInProgress) { pendingClaims = claims; return }
    claimsInProgress = true
    try {
      for (const claim of claims) {
        if (!active || matched !== null) return
        const candidateTicket = parseTicket(await get(ref(database, `pairing/queue/${claim.ticketId}`)))
        if (candidateTicket?.transport !== 'firebase-board-v1' || candidateTicket.uid !== claim.uid || candidateTicket.state !== 'waiting') continue
        const matchId = createPairingMatchId(ticketId, claim.ticketId)
        const acquiredPaths = await acquirePairingLocks(database, {
          hostUid: user.uid,
          guestUid: claim.uid,
          hostTicketId: ticketId,
          guestTicketId: claim.ticketId,
          matchId,
          createdAt: Date.now(),
          expiresAt: Date.now() + FIREBASE_PAIRING_MATCH_TIMEOUT_MS,
        })
        if (acquiredPaths.length === 0) continue
        if (!active || matched !== null) {
          await releasePairingLocks(database, acquiredPaths, matchId)
          return
        }
        acquiredPaths.forEach((path) => lockPaths.add(path))
        const result = await runTransaction(ticketRef, (current) => {
          const currentTicket = current as PairingTicket | null
          if (currentTicket === null || currentTicket.uid !== user.uid || currentTicket.state !== 'waiting' || currentTicket.expiresAt <= Date.now()) return
          return {
            ...currentTicket,
            state: 'matched',
            matchedTicketId: claim.ticketId,
            matchId,
          } satisfies PairingTicket
        }, { applyLocally: false })
        if (!result.committed) {
          await releasePairingLocks(database, acquiredPaths, matchId)
          acquiredPaths.forEach((path) => lockPaths.delete(path))
          continue
        }
        resolveMatch('host', matchId)
        return
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error('隨機配對資料處理失敗。'))
    } finally {
      claimsInProgress = false
      const queued = pendingClaims
      pendingClaims = null
      if (queued !== null && active && matched === null) void processClaims(queued)
    }
  }

  const ownClaimsUnsubscribe = onValue(ref(database, `pairing/claims/${ticketId}`), (snapshot) => {
    if (!active || matched !== null) return
    const claims: PairingClaim[] = []
    snapshot.forEach((child) => {
      const claim = parseClaim(child)
      if (claim !== null && claim.expiresAt > Date.now() && claim.uid !== user.uid && !blockedUids.has(claim.uid)) claims.push(claim)
      return false
    })
    latestClaims = claims
    void processClaims(claims)
  }, fail)
  unsubscribeQueue.add(ownClaimsUnsubscribe)

  const queueUnsubscribe = onValue(
    query(ref(database, 'pairing/queue'), orderByChild('createdAt'), startAt(Date.now() - FIREBASE_PAIRING_WAIT_TIMEOUT_MS), limitToFirst(100)),
    (snapshot) => {
      if (!active || matched !== null) return
      snapshot.forEach((child) => {
        const candidate = parseTicket(child)
        if (
          candidate === null
          || candidate.transport !== 'firebase-board-v1'
          || child.key === null
          || child.key === ticketId
          || candidate.uid === user.uid
          || blockedUids.has(candidate.uid)
          || candidate.state !== 'waiting'
          || candidate.expiresAt <= Date.now()
          || claimedCandidates.has(child.key)
        ) return false
        claimedCandidates.add(child.key)
        const candidateRef = ref(database, `pairing/queue/${child.key}`)
        const candidateUnsubscribe = onValue(candidateRef, (candidateSnapshot) => {
          const current = parseTicket(candidateSnapshot)
          if (current?.state === 'matched' && current.matchedTicketId === ticketId && current.matchId !== undefined) {
            resolveMatch('guest', current.matchId)
          }
        }, fail)
        candidateSubscriptions.set(child.key, candidateUnsubscribe)
        if (shouldClaimPairingCandidate(ticketId, child.key)) {
          const claimPath = `pairing/claims/${child.key}/${ticketId}`
          claimPaths.add(claimPath)
          void claimCandidate(database, child.key, ticketId, user.uid, expiresAt).catch(fail)
        }
        return false
      })
    },
    fail,
  )
  unsubscribeQueue.add(queueUnsubscribe)

  const timeout = window.setTimeout(() => fail(new Error('等待時間到了，配對已離開。')), FIREBASE_PAIRING_WAIT_TIMEOUT_MS)
  const retryClaims = window.setInterval(() => {
    if (active && matched === null && latestClaims.length > 0) void processClaims(latestClaims)
  }, 1500)
  const abort = () => fail(new Error('配對已取消。'))
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  const stopQueueListeners = () => {
    window.clearInterval(retryClaims)
    signal?.removeEventListener('abort', abort)
    window.clearTimeout(timeout)
    unsubscribeQueue.forEach((unsubscribe) => unsubscribe())
    candidateSubscriptions.forEach((unsubscribe) => unsubscribe())
    candidateSubscriptions.clear()
  }

  let matchInfo: { role: FirebasePairingSession['role']; matchId: string }
  try {
    matchInfo = await matchedPromise
  } catch (error) {
    stopQueueListeners()
    await Promise.all([...claimPaths].map((path) => remove(ref(database, path)).catch(() => undefined)))
    await remove(ticketRef).catch(() => undefined)
    throw error
  }
  stopQueueListeners()

  const matchId = matchInfo.matchId
  const role = matchInfo.role
  const matchRef = ref(database, `pairing/matches/${matchId}`)
  let finalMatch: PairingMatch
  try {
    if (role === 'host') {
      const ticket = parseTicket(await new Promise<DataSnapshot>((resolve) => onValue(ticketRef, resolve, { onlyOnce: true })))
      if (ticket === null || ticket.matchedTicketId === undefined) throw new Error('隨機配對資料不完整。')
      const guestSnapshot = await new Promise<DataSnapshot>((resolve, reject) => onValue(ref(database, `pairing/queue/${ticket.matchedTicketId}`), resolve, reject, { onlyOnce: true }))
      const guestTicket = parseTicket(guestSnapshot)
      if (guestTicket === null || guestTicket.uid === user.uid) throw new Error('找不到另一位玩家。')
      const completeMatch: PairingMatch = {
        hostUid: user.uid,
        guestUid: guestTicket.uid,
        hostTicketId: ticketId,
        guestTicketId: ticket.matchedTicketId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
      }
      await runTransaction(matchRef, (current) => current ?? completeMatch)
      finalMatch = await waitForMatch(database, matchId, 30_000, signal)
    } else {
      finalMatch = await waitForMatch(database, matchId, 30_000, signal)
    }
  } catch (error) {
    await onDisconnect(ticketRef).cancel().catch(() => undefined)
    await releasePairingLocks(database, [...lockPaths], matchId)
    await remove(ticketRef).catch(() => undefined)
    throw error
  }
  // 短暫斷線不刪除整局；由 presence 表示斷線，恢復後讀回局面。
  const peerUid = role === 'host' ? finalMatch.guestUid : finalMatch.hostUid
  if (blockedUids.has(peerUid)) {
    await remove(matchRef).catch(() => undefined)
    await remove(ticketRef).catch(() => undefined)
    throw new Error('已封鎖的玩家不能加入配對。')
  }

  let cancelled = false
  const cancel = async () => {
    if (cancelled) return
    cancelled = true
    await onDisconnect(ticketRef).cancel().catch(() => undefined)
    await remove(ticketRef).catch(() => undefined)
    await Promise.all([...claimPaths].map((path) => remove(ref(database, path)).catch(() => undefined)))
    await releasePairingLocks(database, [...lockPaths], matchId)
    await remove(matchRef).catch(() => undefined)
  }

  const session: FirebasePairingSession = {
    uid: user.uid,
    ticketId,
    matchId,
    role,
    createGame: (signal) => createFirebaseGameSession(database, session, finalMatch.hostUid, finalMatch.guestUid, signal, finalMatch.expiresAt),
    publishOffer: async (signal) => {
      if (role !== 'host' || signal.kind !== 'offer') throw new Error('隨機配對邀請資料角色不正確。')
      await publishSignal(database, matchId, signal)
    },
    publishAnswer: async (signal) => {
      if (role !== 'guest' || signal.kind !== 'answer') throw new Error('隨機配對回覆資料角色不正確。')
      await publishSignal(database, matchId, signal)
    },
    waitForOffer: (timeoutMs = FIREBASE_PAIRING_MATCH_TIMEOUT_MS) => waitForSignal(database, matchId, 'offer', timeoutMs),
    waitForAnswer: (timeoutMs = FIREBASE_PAIRING_MATCH_TIMEOUT_MS) => waitForSignal(database, matchId, 'answer', timeoutMs),
    cancel,
    report: async () => {
      const reportRef = push(ref(database, 'pairing/reports'))
      if (reportRef.key === null) throw new Error('無法建立檢舉資料。')
      await set(reportRef, { reporterUid: user.uid, targetUid: peerUid, matchId, createdAt: Date.now() })
    },
    block: async () => {
      blockedUids.add(peerUid)
      writeBlockedUids(blockedUids)
      await cancel()
    },
  }

  if (finalMatch.expiresAt <= Date.now()) {
    await cancel()
    throw new Error('隨機配對已逾時。')
  }
  return session
}
