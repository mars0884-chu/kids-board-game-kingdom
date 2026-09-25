import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, get, ref, set } from 'firebase/database'
import { createFirebaseTurnSession, type FirebaseTurnSession } from '../src/online/firebase-turn-game'
import { ticTacToeOnlineRules } from '../src/online/turn-rules'
import { getLegalTicTacToeMoves, playTicTacToeMove, serializeTicTacToeState, type TicTacToeState } from '../src/games/tic-tac-toe/rules'
import type { FirebasePairingSession } from '../src/online/firebase-pairing'

const apps = ['turn-host', 'turn-guest', 'turn-stranger'].map((name) => initializeApp({ projectId: 'demo-kids-board', apiKey: 'demo-key', databaseURL: 'https://demo-kids-board-default-rtdb.firebaseio.com' }, name))
const databases = apps.map((app) => { const database = getDatabase(app); connectDatabaseEmulator(database, '127.0.0.1', 9000); return database })
const uids: string[] = []
const matchId = 'integration-tic-tac-toe'
const base = `pairing/matches/${matchId}`
let host: FirebaseTurnSession<TicTacToeState>
let guest: FirebaseTurnSession<TicTacToeState>
const pairing = (index: number): FirebasePairingSession => ({
  uid: uids[index]!, ticketId: `turn-ticket-${index}`, matchId, role: index === 0 ? 'host' : 'guest',
  gameId: 'tic-tac-toe', hostUid: uids[0]!, guestUid: uids[1]!, expiresAt: Date.now() + 600000,
  createGame: async () => { throw new Error('未使用') },
  publishOffer: async () => {}, publishAnswer: async () => {},
  waitForOffer: async () => { throw new Error('未使用') },
  waitForAnswer: async () => { throw new Error('未使用') },
  cancel: async () => {}, report: async () => {}, block: async () => {},
})

beforeAll(async () => {
  for (const app of apps) {
    const auth = getAuth(app)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    uids.push((await signInAnonymously(auth)).user.uid)
  }
  await set(ref(databases[0]!, base), {
    hostUid: uids[0], guestUid: uids[1], hostTicketId: 'turn-host-ticket', guestTicketId: 'turn-guest-ticket',
    gameId: 'tic-tac-toe', createdAt: Date.now(), expiresAt: Date.now() + 600000,
  })
})
afterAll(async () => { host?.close(); guest?.close(); await Promise.all(apps.map(deleteApp)) })

describe('井字棋共用 Firebase 房間雙端驗證', () => {
  it('雙方建立同棋種房間，不能拿其他棋種規則加入', async () => {
    await expect(createFirebaseTurnSession(databases[0]!, pairing(0), 'gomoku', uids[0]!, uids[1]!, new AbortController().signal, ticTacToeOnlineRules)).rejects.toThrow('棋種')
    ;[host, guest] = await Promise.all([0, 1].map((index) => createFirebaseTurnSession(databases[index]!, pairing(index), 'tic-tac-toe', uids[0]!, uids[1]!, new AbortController().signal, ticTacToeOnlineRules)))
    expect(host.role).toBe('host')
    expect(guest.role).toBe('guest')
  })

  it('甲乙各走一步後同步，違反回合與第三者讀取均遭拒', async () => {
    let guestState = ticTacToeOnlineRules.initial()
    let hostState = ticTacToeOnlineRules.initial()
    const stopGuest = guest.subscribe((next) => { guestState = next }, () => {})
    const stopHost = host.subscribe((next) => { hostState = next }, () => {})
    const first = playTicTacToeMove(hostState, getLegalTicTacToeMoves(hostState)[0]!)
    await expect(guest.submit(first)).rejects.toThrow('不合法')
    await host.submit(first)
    await vi.waitFor(() => expect(serializeTicTacToeState(guestState)).toBe(serializeTicTacToeState(first)))
    const second = playTicTacToeMove(guestState, getLegalTicTacToeMoves(guestState)[0]!)
    await guest.submit(second)
    await vi.waitFor(() => expect(serializeTicTacToeState(hostState)).toBe(serializeTicTacToeState(second)))
    await expect(get(ref(databases[2]!, `${base}/board`))).rejects.toThrow()
    stopGuest(); stopHost()
  })
})
