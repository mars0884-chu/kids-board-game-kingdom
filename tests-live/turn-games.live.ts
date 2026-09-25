import { expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInAnonymously, deleteUser } from 'firebase/auth'
import { getDatabase, get, ref, set } from 'firebase/database'
import { createTurnRoom, type TrustedTurnGameId } from '../server/turn-game-authority'
import { animalChessOnlineRules, gomokuOnlineRules, reversiOnlineRules, ticTacToeOnlineRules } from '../src/online/turn-rules'
import { chooseOnlineNumberGemCell, numberGemOnlineRules } from '../src/online/number-gem-turn-rules'
import { getLegalAnimalChessMoves, applyAnimalChessMove } from '../src/games/animal-chess/rules'
import { getLegalGomokuMoves, playGomokuMove } from '../src/games/gomoku/rules'
import { getLegalReversiMoves, applyReversiMove } from '../src/games/reversi/rules'
import { getLegalTicTacToeMoves, playTicTacToeMove } from '../src/games/tic-tac-toe/rules'

const firstStep: Record<TrustedTurnGameId, () => string> = {
  'animal-chess': () => { const state = animalChessOnlineRules.initial(); return animalChessOnlineRules.serialize(applyAnimalChessMove(state, getLegalAnimalChessMoves(state)[0]!)) },
  gomoku: () => { const state = gomokuOnlineRules.initial(); return gomokuOnlineRules.serialize(playGomokuMove(state, getLegalGomokuMoves(state)[0]!)) },
  'number-gem': () => {
    const state = numberGemOnlineRules.initial()
    const next = state.state.puzzle.board.map((_, index) => chooseOnlineNumberGemCell(state, index))
      .find((candidate) => numberGemOnlineRules.serialize(candidate) !== numberGemOnlineRules.serialize(state))!
    return numberGemOnlineRules.serialize(next)
  },
  reversi: () => { const state = reversiOnlineRules.initial(); return reversiOnlineRules.serialize(applyReversiMove(state, getLegalReversiMoves(state)[0]!)) },
  'tic-tac-toe': () => { const state = ticTacToeOnlineRules.initial(); return ticTacToeOnlineRules.serialize(playTicTacToeMove(state, getLegalTicTacToeMoves(state)[0]!)) },
}

for (const gameId of Object.keys(firstStep) as TrustedTurnGameId[]) {
  it(`正式 ${gameId} 服務驗證兩位匿名玩家及合法回合`, async () => {
    if (process.env.FIREBASE_LIVE_SMOKE !== '1') throw new Error('必須明確設定 FIREBASE_LIVE_SMOKE=1 才能執行正式服務測試。')
    const config = {
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    }
    const workerUrl = process.env.VITE_TURN_GAME_WORKER_URL?.replace(/\/$/, '')
    if (config.projectId !== 'kids-board-game-kingdom' || !config.apiKey || !config.databaseURL ||
      workerUrl !== 'https://kids-board-turn-games.kids-board-game-kingdom.workers.dev') throw new Error('正式專案或回合服務設定不符。')
    const matchId = 'verification-' + crypto.randomUUID()
    const apps = [0, 1].map((index) => initializeApp(config, matchId + '-' + index))
    const databases = apps.map((app) => getDatabase(app))
    const matchRef = ref(databases[0]!, 'pairing/matches/' + matchId)
    let created = false
    try {
      const users = await Promise.all(apps.map(async (app) => (await signInAnonymously(getAuth(app))).user))
      const expiresAt = Date.now() + 120000
      await set(matchRef, {
        gameId, hostUid: users[0]!.uid, guestUid: users[1]!.uid,
        hostTicketId: matchId + '-host', guestTicketId: matchId + '-guest',
        createdAt: Date.now(), expiresAt,
      })
      created = true
      const endpoint = `${workerUrl}/rooms/${matchId}`
      const request = async (index: number, action?: 'step' | 'restart', expectedRevision = 0, serialized?: string) => {
        const response = await fetch(endpoint + (action === undefined ? '' : '/' + action), {
          method: action === undefined ? 'GET' : 'POST',
          headers: {
            origin: 'https://mars0884-chu.github.io',
            authorization: `Bearer ${await users[index]!.getIdToken()}`,
            ...(action === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: action === undefined ? undefined : JSON.stringify({ expectedRevision, serialized }),
        })
        return { status: response.status, body: await response.json() as Record<string, unknown> }
      }
      const initial = await request(0)
      expect(initial.status).toBe(200)
      expect(initial.body).toEqual(createTurnRoom(gameId))
      const next = firstStep[gameId]()
      expect((await request(1, 'step', 0, next)).status).toBe(400)
      const moved = await request(0, 'step', 0, next)
      expect(moved.status).toBe(200)
      expect(moved.body.revision).toBe(1)
      expect(moved.body.serialized).toBe(next)
      expect((await request(0, 'step', 0, next)).status).toBe(400)
      expect((await request(1)).body).toEqual(moved.body)
      expect((await request(1, 'restart', 1)).status).toBe(400)
      const restarted = await request(0, 'restart', 1)
      expect(restarted.status).toBe(200)
      expect(restarted.body.revision).toBe(2)
      expect(restarted.body.serialized).toBe(initial.body.serialized)
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
  }, 60000)
}
