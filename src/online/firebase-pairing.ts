import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, type User } from 'firebase/auth'
import {
  getDatabase,
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
  type Database,
  type DataSnapshot,
} from 'firebase/database'
import type { WebRtcSignal } from './webrtc'

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
  })()
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
): Promise<T> {
  return new Promise((resolve, reject) => {
    const target = ref(database, path)
    let settled = false
    const finish = (error: Error | null, value?: T) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      unsubscribe()
      if (error !== null) reject(error)
      else resolve(value as T)
    }
    const unsubscribe = onValue(target, (snapshot) => {
      const parsed = parse(snapshot)
      if (parsed !== null) finish(null, parsed)
    }, (error) => finish(error))
    const timeout = window.setTimeout(() => {
      finish(new Error('等待隨機配對資料逾時。'))
    }, timeoutMs)
  })
}

function waitForMatch(database: Database, matchId: string, timeoutMs: number): Promise<PairingMatch> {
  return waitForSnapshot(database, `pairing/matches/${matchId}`, parseMatch, timeoutMs)
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
): Promise<FirebasePairingSession> {
  const { database, user } = await getFirebaseServices()
  const blockedUids = readBlockedUids()
  onStatus?.('signing-in')

  const ticketRef = push(ref(database, 'pairing/queue'))
  const ticketId = ticketRef.key
  if (ticketId === null) throw new Error('無法建立隨機配對識別碼。')
  const createdAt = Date.now()
  const expiresAt = createdAt + FIREBASE_PAIRING_WAIT_TIMEOUT_MS
  await set(ticketRef, { uid: user.uid, state: 'waiting', createdAt, expiresAt } satisfies PairingTicket)
  await onDisconnect(ticketRef).remove()
  onStatus?.('waiting')

  let active = true
  const unsubscribeQueue = new Set<() => void>()
  const claimedCandidates = new Set<string>()
  const candidateSubscriptions = new Map<string, () => void>()
  const claimPaths = new Set<string>()
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
      resolveMatch('host', ticket.matchId)
    }
  }, fail)
  unsubscribeQueue.add(ownTicketUnsubscribe)

  const ownClaimsUnsubscribe = onValue(ref(database, `pairing/claims/${ticketId}`), (snapshot) => {
    if (!active || matched !== null) return
    const claims: PairingClaim[] = []
    snapshot.forEach((child) => {
      const claim = parseClaim(child)
      if (claim !== null && claim.expiresAt > Date.now() && claim.uid !== user.uid && !blockedUids.has(claim.uid)) claims.push(claim)
      return false
    })
    const claim = claims[0]
    if (claim === undefined) return
    let generatedMatchId = ''
    void runTransaction(ticketRef, (current) => {
      const currentTicket = current as PairingTicket | null
      if (currentTicket === null || currentTicket.uid !== user.uid || currentTicket.state !== 'waiting' || currentTicket.expiresAt <= Date.now()) return current
      if (generatedMatchId === '') generatedMatchId = `match-${ticketId}-${claim.ticketId}`
      return {
        ...currentTicket,
        state: 'matched',
        matchedTicketId: claim.ticketId,
        matchId: generatedMatchId,
      } satisfies PairingTicket
    }).catch(fail)
  }, fail)
  unsubscribeQueue.add(ownClaimsUnsubscribe)

  const queueUnsubscribe = onValue(
    query(ref(database, 'pairing/queue'), orderByChild('createdAt'), limitToFirst(20)),
    (snapshot) => {
      if (!active || matched !== null) return
      snapshot.forEach((child) => {
        const candidate = parseTicket(child)
        if (
          candidate === null
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
        const claimPath = `pairing/claims/${child.key}/${ticketId}`
        claimPaths.add(claimPath)
        void claimCandidate(database, child.key, ticketId, user.uid, expiresAt).catch(fail)
        return false
      })
    },
    fail,
  )
  unsubscribeQueue.add(queueUnsubscribe)

  const timeout = window.setTimeout(() => fail(new Error('等待時間到了，配對已離開。')), FIREBASE_PAIRING_WAIT_TIMEOUT_MS)

  const stopQueueListeners = () => {
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
    await remove(ticketRef).catch(() => undefined)
    throw error
  }
  stopQueueListeners()

  const matchId = matchInfo.matchId
  const role = matchInfo.role
  const matchRef = ref(database, `pairing/matches/${matchId}`)
  let finalMatch: PairingMatch
  if (role === 'host') {
    const ticket = parseTicket(await new Promise<DataSnapshot>((resolve) => onValue(ticketRef, resolve, { onlyOnce: true })))
    if (ticket === null || ticket.matchedTicketId === undefined) throw new Error('隨機配對資料不完整。')
    const guestSnapshot = await new Promise<DataSnapshot>((resolve) => onValue(ref(database, `pairing/queue/${ticket.matchedTicketId}`), resolve, { onlyOnce: true }))
    const guestTicket = parseTicket(guestSnapshot)
    if (guestTicket === null || guestTicket.uid === user.uid) throw new Error('找不到另一位玩家。')
    const completeMatch: PairingMatch = {
      hostUid: user.uid,
      guestUid: guestTicket.uid,
      hostTicketId: ticketId,
      guestTicketId: ticket.matchedTicketId,
      createdAt: Date.now(),
      expiresAt: Date.now() + FIREBASE_PAIRING_MATCH_TIMEOUT_MS,
    }
    await runTransaction(matchRef, (current) => current ?? completeMatch)
    finalMatch = await waitForMatch(database, matchId, FIREBASE_PAIRING_MATCH_TIMEOUT_MS)
  } else {
    finalMatch = await waitForMatch(database, matchId, FIREBASE_PAIRING_MATCH_TIMEOUT_MS)
  }
  await onDisconnect(matchRef).remove()
  const peerUid = role === 'host' ? finalMatch.guestUid : finalMatch.hostUid
  if (blockedUids.has(peerUid)) {
    await remove(matchRef).catch(() => undefined)
    await remove(ticketRef).catch(() => undefined)
    throw new Error('已封鎖的玩家不能加入配對。')
  }

  const cancel = async () => {
    await onDisconnect(ticketRef).cancel().catch(() => undefined)
    await remove(ticketRef).catch(() => undefined)
    await Promise.all([...claimPaths].map((path) => remove(ref(database, path)).catch(() => undefined)))
    await remove(matchRef).catch(() => undefined)
  }

  const session: FirebasePairingSession = {
    uid: user.uid,
    ticketId,
    matchId,
    role,
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
