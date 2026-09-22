import { expect, it, vi } from 'vitest'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInAnonymously, deleteUser } from 'firebase/auth'
import { getDatabase, get, ref } from 'firebase/database'
import { createFriendInvitation, joinFriendInvitation, friendServerNow } from '../src/online/firebase-friend'
import type { FirebaseGameSession } from '../src/online/firebase-game'
import type { FirebaseServices } from '../src/online/firebase-pairing'
import { createJumpChessState, getLegalJumpMoves, applyJumpChessMove, serializeJumpChessState } from '../src/games/jump-chess/rules'

it('正式熟人邀請：僅自建房間、雙端走棋並清除測試資料', async () => {
  if (process.env.FIREBASE_LIVE_SMOKE !== '1') throw new Error('需明確啟用正式服務驗證')
  const config = { apiKey: process.env.VITE_FIREBASE_API_KEY, authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL, projectId: process.env.VITE_FIREBASE_PROJECT_ID }
  if (config.projectId !== 'kids-board-game-kingdom' || !config.apiKey || !config.databaseURL) throw new Error('專案不符')
  const prefix = 'friend-verification-' + crypto.randomUUID()
  const apps = [0,1].map(i => initializeApp(config, prefix + i))
  const services: FirebaseServices[] = []
  const sessions: FirebaseGameSession[] = []
  const removals: (() => void)[] = []
  const controller = new AbortController()
  let invitation: Awaited<ReturnType<typeof createFriendInvitation>> | undefined
  try {
    for (const app of apps) services.push({ app, database: getDatabase(app), user: (await signInAnonymously(getAuth(app))).user })
    console.info('正式服務時差（毫秒）', await friendServerNow(services[0]!, controller.signal) - Date.now())
    invitation = await createFriendInvitation(controller.signal, services[0])
    sessions.push(...await Promise.all([invitation.waitForGuest(), joinFriendInvitation(invitation.id, controller.signal, services[1])]))
    expect(sessions.map(s => s.role)).toEqual(['host','guest'])
    const seen = ['', '']
    sessions.forEach((s,i) => removals.push(s.subscribe(state => { seen[i] = serializeJumpChessState(state) }, () => {})))
    let state = createJumpChessState()
    for (const index of [0,1]) {
      state = applyJumpChessMove(state, getLegalJumpMoves(state).find(m => m.kind === 'step')!)
      await sessions[index]!.submit(state)
      await vi.waitFor(() => expect(seen).toEqual([serializeJumpChessState(state), serializeJumpChessState(state)]), {timeout:15000})
    }
    expect((await get(ref(services[0]!.database, 'pairing/matches/' + invitation.id + '/board'))).val().revision).toBe(2)
  } finally {
    removals.forEach(remove => remove())
    try {
      if (invitation) {
        await invitation.cancel()
        expect((await get(ref(services[0]!.database, 'privateInvites/' + invitation.id))).exists()).toBe(false)
        expect((await get(ref(services[0]!.database, 'pairing/matches/' + invitation.id))).exists()).toBe(false)
      }
    } finally {
      controller.abort()
      sessions.forEach(s => s.close())
      try {
        await Promise.all(apps.map(async app => { const user = getAuth(app).currentUser; if(user) await deleteUser(user) }))
      } finally { await Promise.all(apps.map(deleteApp)) }
    }
  }
})
