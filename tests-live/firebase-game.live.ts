import { expect, it, vi } from 'vitest'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInAnonymously, deleteUser } from 'firebase/auth'
import { getDatabase, get, ref, set } from 'firebase/database'
import { createFirebaseGameSession, type FirebaseGameSession } from '../src/online/firebase-game'
import { createJumpChessState, getLegalJumpMoves, applyJumpChessMove, serializeJumpChessState } from '../src/games/jump-chess/rules'
import type { FirebasePairingSession } from '../src/online/firebase-pairing'

it('正式服務的隔離匿名棋局：雙端就緒與雙向棋步同步', async () => {
  if (process.env.FIREBASE_LIVE_SMOKE !== '1') throw new Error('必須明確設定 FIREBASE_LIVE_SMOKE=1 才能執行正式服務測試。')
  const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  }
  if (config.projectId !== 'kids-board-game-kingdom' || !config.apiKey || !config.databaseURL) throw new Error('目標專案或設定不符。')
  const matchId = 'verification-' + crypto.randomUUID()
  const apps = [0, 1].map((index) => initializeApp(config, matchId + '-' + index))
  const databases = apps.map((app) => getDatabase(app))
  const base = 'pairing/matches/' + matchId
  const sessions: FirebaseGameSession[] = []
  const controllers = [new AbortController(), new AbortController()]
  const removals: (() => void)[] = []
  let created = false
  try {
    const users = await Promise.all(apps.map(async (app) => (await signInAnonymously(getAuth(app))).user))
    const uids = users.map((user) => user.uid)
    await set(ref(databases[0]!, base), {
      hostUid: uids[0], guestUid: uids[1], hostTicketId: matchId + '-host', guestTicketId: matchId + '-guest',
      createdAt: Date.now(), expiresAt: Date.now() + 120000,
    })
    created = true
    const pairing = (index: number): FirebasePairingSession => ({
      uid: uids[index]!, ticketId: matchId + '-' + index, matchId, role: index === 0 ? 'host' : 'guest',
      createGame: async () => { throw new Error('不使用配對佇列。') },
      publishOffer: async () => {}, publishAnswer: async () => {},
      waitForOffer: async () => { throw new Error('不使用 WebRTC。') },
      waitForAnswer: async () => { throw new Error('不使用 WebRTC。') },
      cancel: async () => {}, report: async () => {}, block: async () => {},
    })
    await Promise.all([0, 1].map(async (index) => {
      sessions[index] = await createFirebaseGameSession(databases[index]!, pairing(index), uids[0]!, uids[1]!, controllers[index]!.signal, Date.now() + 120000)
    }))
    const seen = ['', '']
    sessions.forEach((session, index) => removals.push(session.subscribe((state) => { seen[index] = serializeJumpChessState(state) }, () => {})))
    let state = createJumpChessState()
    for (const index of [0, 1]) {
      const move = getLegalJumpMoves(state).find((candidate) => candidate.kind === 'step')!
      state = applyJumpChessMove(state, move)
      await sessions[index]!.submit(state)
      await vi.waitFor(() => expect(seen).toEqual([serializeJumpChessState(state), serializeJumpChessState(state)]), { timeout: 15000 })
    }
    expect((await get(ref(databases[0]!, base + '/board'))).val().revision).toBe(2)
  } finally {
    controllers.forEach((controller) => controller.abort())
    removals.forEach((remove) => remove())
    sessions.forEach((session) => session?.close())
    try {
      if (created) {
        await set(ref(databases[0]!, base), null)
        expect((await get(ref(databases[0]!, base))).exists()).toBe(false)
      }
    } finally {
      try {
        await Promise.all(apps.map(async (app) => {
          const user = getAuth(app).currentUser
          if (user) await deleteUser(user)
        }))
      } finally { await Promise.all(apps.map((app) => deleteApp(app))) }
    }
  }
})
