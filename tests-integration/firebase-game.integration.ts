import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, ref, set, get, goOffline, goOnline } from 'firebase/database'
import { createFirebaseGameSession, type FirebaseGameSession } from '../src/online/firebase-game'
import { createJumpChessState, applyJumpChessMove, getLegalJumpMoves, serializeJumpChessState, deserializeJumpChessState } from '../src/games/jump-chess/rules'
import type { FirebasePairingSession } from '../src/online/firebase-pairing'

const apps = ['host', 'guest', 'stranger'].map((name) => initializeApp({ projectId: 'demo-kids-board', apiKey: 'demo-key', databaseURL: 'https://demo-kids-board-default-rtdb.firebaseio.com' }, name))
const databases = apps.map((app) => { const db = getDatabase(app); connectDatabaseEmulator(db, '127.0.0.1', 9000); return db })
const uids: string[] = []
let host: FirebaseGameSession
let guest: FirebaseGameSession
const matchId = 'integration-game'
const base = `pairing/matches/${matchId}`
const controllers = [new AbortController(), new AbortController()]
const pairing = (index: number): FirebasePairingSession => ({
  uid: uids[index]!, ticketId: `ticket-${index}`, matchId, role: index === 0 ? 'host' : 'guest',
  gameId: 'jump-chess', hostUid: uids[0]!, guestUid: uids[1]!, expiresAt: Date.now() + 600000,
  createGame: async () => { throw new Error('未使用') },
  publishOffer: async () => {}, publishAnswer: async () => {},
  waitForOffer: async () => { throw new Error('不應使用 WebRTC') },
  waitForAnswer: async () => { throw new Error('不應使用 WebRTC') },
  cancel: async () => { await set(ref(databases[index]!, base), null) },
  report: async () => {}, block: async () => {},
})

beforeAll(async () => {
  for (const app of apps) {
    const auth = getAuth(app)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    uids.push((await signInAnonymously(auth)).user.uid)
  }
  await set(ref(databases[0]!, base), { hostUid: uids[0], guestUid: uids[1], hostTicketId: 'host-ticket', guestTicketId: 'guest-ticket', createdAt: Date.now(), expiresAt: Date.now() + 600000 })
})
afterAll(async () => { host?.close(); guest?.close(); await Promise.all(apps.map(deleteApp)) })

describe('Firebase 真實模擬器雙端同步與權限', () => {
  it('雙方讀回棋盤才完成就緒，不建立 WebRTC', async () => {
    ;[host, guest] = await Promise.all([0, 1].map((index) => createFirebaseGameSession(databases[index]!, pairing(index), uids[0]!, uids[1]!, controllers[index]!.signal)))
    expect(host.transport).toBe('firebase')
    expect(guest.transport).toBe('firebase')
  })
  it('甲走棋後乙收到一致局面，重複舊棋步被拒絕', async () => {
    let seen = ''
    const unsubscribe = guest.subscribe((state) => { seen = serializeJumpChessState(state) }, () => {})
    const initial = createJumpChessState()
    const move = getLegalJumpMoves(initial).find((candidate) => candidate.kind === 'step')!
    const next = applyJumpChessMove(initial, move)
    await host.submit(next)
    await vi.waitFor(() => expect(seen).toBe(serializeJumpChessState(next)))
    await expect(host.submit(next)).rejects.toThrow()
    unsubscribe()
  })
  it('禁止第三者讀局面、冒充對手在線、舊序號覆寫與甲整包覆寫', async () => {
    await expect(get(ref(databases[2]!, base))).rejects.toThrow()
    await expect(set(ref(databases[0]!, `${base}/presence/${uids[1]}`), true)).rejects.toThrow()
    const board = (await get(ref(databases[1]!, `${base}/board`))).val()
    await expect(set(ref(databases[1]!, `${base}/board`), board)).rejects.toThrow()
    const match = (await get(ref(databases[0]!, base))).val()
    await expect(set(ref(databases[0]!, base), { ...match, guestUid: uids[2] })).rejects.toThrow()
  })
  it('乙短暫斷線保留棋盤，重新連線後雙方恢復', async () => {
    let hostConnected = true
    const unsubscribe = host.subscribe(() => {}, (connected) => { hostConnected = connected })
    const before = (await get(ref(databases[0]!, `${base}/board`))).val()
    goOffline(databases[1]!)
    await vi.waitFor(() => expect(hostConnected).toBe(false), { timeout: 15000 })
    expect((await get(ref(databases[0]!, `${base}/board`))).val()).toEqual(before)
    goOnline(databases[1]!)
    await vi.waitFor(() => expect(hostConnected).toBe(true), { timeout: 15000 })
    unsubscribe()
  })
  it('乙走棋後甲同步，甲可重開且保留遞增序號', async () => {
    const board = (await get(ref(databases[1]!, base + '/board'))).val()
    const state = deserializeJumpChessState(board.serialized)
    const move = getLegalJumpMoves(state).find((candidate) => candidate.kind === 'step')!
    const next = applyJumpChessMove(state, move)
    let seen = ''
    const unsubscribe = host.subscribe((value) => { seen = serializeJumpChessState(value) }, () => {})
    await guest.submit(next)
    await vi.waitFor(() => expect(seen).toBe(serializeJumpChessState(next)))
    await host.submit(createJumpChessState())
    await vi.waitFor(() => expect(seen).toBe(serializeJumpChessState(createJumpChessState())))
    expect((await get(ref(databases[0]!, base + '/board'))).val().revision).toBe(board.revision + 2)
    unsubscribe()
  })
})
