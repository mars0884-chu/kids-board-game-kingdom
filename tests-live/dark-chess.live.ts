import { expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInAnonymously, deleteUser } from 'firebase/auth'
import { getDatabase, get, ref, set } from 'firebase/database'

it('正式暗棋服務以兩個匿名玩家驗證蓋牌遮蔽、回合與過期版本', async () => {
  if (process.env.FIREBASE_LIVE_SMOKE !== '1') throw new Error('必須明確設定 FIREBASE_LIVE_SMOKE=1 才能執行正式服務測試。')
  const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  }
  const workerUrl = process.env.VITE_DARK_CHESS_WORKER_URL?.replace(/\/$/, '')
  if (config.projectId !== 'kids-board-game-kingdom' || !config.apiKey || !config.databaseURL ||
    workerUrl !== 'https://kids-board-dark-chess.kids-board-game-kingdom.workers.dev') throw new Error('正式專案或暗棋服務設定不符。')
  const matchId = 'verification-' + crypto.randomUUID()
  const apps = [0, 1].map((index) => initializeApp(config, matchId + '-' + index))
  const databases = apps.map((app) => getDatabase(app))
  const matchRef = ref(databases[0]!, 'pairing/matches/' + matchId)
  let created = false
  try {
    const users = await Promise.all(apps.map(async (app) => (await signInAnonymously(getAuth(app))).user))
    const expiresAt = Date.now() + 120000
    await set(matchRef, {
      gameId: 'dark-chess', hostUid: users[0]!.uid, guestUid: users[1]!.uid,
      hostTicketId: matchId + '-host', guestTicketId: matchId + '-guest',
      createdAt: Date.now(), expiresAt,
    })
    created = true
    const endpoint = `${workerUrl}/rooms/${matchId}`
    const request = async (index: number, action?: unknown, expectedRevision = 0) => {
      const response = await fetch(endpoint + (action === undefined ? '' : '/action'), {
        method: action === undefined ? 'GET' : 'POST',
        headers: {
          origin: 'https://mars0884-chu.github.io',
          authorization: `Bearer ${await users[index]!.getIdToken()}`,
          ...(action === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: action === undefined ? undefined : JSON.stringify({ action, expectedRevision }),
      })
      return { status: response.status, body: await response.json() as Record<string, unknown> }
    }
    const initial = await request(0)
    expect(initial.status).toBe(200)
    const state = initial.body.state as { board: { revealed: boolean; color: string | null; kind: string | null }[] }
    expect(state.board).toHaveLength(32)
    expect(state.board.every((piece) => !piece.revealed && piece.color === null && piece.kind === null)).toBe(true)
    expect(JSON.stringify(initial.body)).not.toMatch(/seed|secretState|pieces/)
    expect((await request(1, { kind: 'flip', cell: 0 })).status).toBe(400)
    const hostMove = await request(0, { kind: 'flip', cell: 0 })
    expect(hostMove.status).toBe(200)
    expect(hostMove.body.revision).toBe(1)
    expect((await request(1, { kind: 'flip', cell: 1 }, 0)).status).toBe(400)
    const guestMove = await request(1, { kind: 'flip', cell: 1 }, 1)
    expect(guestMove.status).toBe(200)
    expect(guestMove.body.revision).toBe(2)
    const refreshed = await request(0)
    expect(refreshed.status).toBe(200)
    expect(refreshed.body.revision).toBe(2)
    const board = (refreshed.body.state as typeof state).board
    expect(board[0]?.revealed).toBe(true)
    expect(board[1]?.revealed).toBe(true)
    expect(board.slice(2).every((piece) => !piece.revealed && piece.color === null && piece.kind === null)).toBe(true)
  } finally {
    try {
      if (created) {
        await set(matchRef, null)
        expect((await get(matchRef)).exists()).toBe(false)
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
