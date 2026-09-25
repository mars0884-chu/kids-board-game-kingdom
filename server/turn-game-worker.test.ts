import { describe, expect, it, vi } from 'vitest'
import worker, { TurnGameRoom } from './turn-game-worker'
import { createTurnRoom } from './turn-game-authority'
import { ticTacToeOnlineRules } from '../src/online/turn-rules'
import { getLegalTicTacToeMoves, playTicTacToeMove } from '../src/games/tic-tac-toe/rules'
import { createNumberGemPuzzle, findNumberGemSolutionPath } from '../src/games/number-gem-connection/generator'
import type { NumberGemRaceState } from '../src/online/number-gem-race-rules'

const expiresAt = Date.now() + 600000

function createRoom() {
  const values = new Map<string, unknown>()
  return new TurnGameRoom({ storage: {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => { values.set(key, value) },
    deleteAll: async () => { values.clear() },
    setAlarm: async () => {},
  } })
}

function request(role: 'host' | 'guest', path = '', serialized?: string, expectedRevision = 0, gameId = 'tic-tac-toe') {
  return new Request(`https://worker.test/rooms/test-room-123${path}`, {
    method: serialized === undefined ? 'GET' : 'POST',
    headers: {
      'x-game-host': 'host-uid', 'x-game-guest': 'guest-uid',
      'x-game-uid': role === 'host' ? 'host-uid' : 'guest-uid',
      'x-game-id': gameId, 'x-game-expires': String(expiresAt),
    },
    body: serialized === undefined ? undefined : JSON.stringify({ serialized, expectedRevision }),
  })
}

function raceRequest(role: 'host' | 'guest', path = '/race', body?: unknown) {
  return new Request(`https://worker.test/rooms/test-room-123${path}`, {
    method: body === undefined && path === '/race' ? 'GET' : 'POST',
    headers: {
      'x-game-host': 'host-uid', 'x-game-guest': 'guest-uid',
      'x-game-uid': role === 'host' ? 'host-uid' : 'guest-uid',
      'x-game-id': 'number-gem', 'x-game-expires': String(expiresAt),
    },
    body: body === undefined && path === '/race' ? undefined : JSON.stringify(body ?? {}),
  })
}

describe('五款棋類可信回合房間', () => {
  it('數字寶石同題搶答只由首份有效解答得分，後手無法重新開局', async () => {
    const room = createRoom()
    const first = await room.fetch(raceRequest('host', '/race/ready'))
    expect((await first.json() as { state: NumberGemRaceState }).state.phase).toBe('ready')
    const second = await room.fetch(raceRequest('guest', '/race/ready'))
    const started = (await second.json() as { state: NumberGemRaceState }).state
    expect(started.phase).toBe('playing')
    expect((await room.fetch(raceRequest('guest', '/race/restart'))).status).toBe(400)
    expect((await room.fetch(raceRequest('guest', '/race/solve', { path: [999] }))).status).toBe(400)
    const answer = findNumberGemSolutionPath(createNumberGemPuzzle(started.seed, 'beginner'))!
    vi.spyOn(Date, 'now').mockReturnValue(started.startsAt!)
    try {
      const [host, guest] = await Promise.all([
        room.fetch(raceRequest('host', '/race/solve', { path: answer })),
        room.fetch(raceRequest('guest', '/race/solve', { path: answer })),
      ])
      expect([host.status, guest.status].sort()).toEqual([200, 400])
      const view = await room.fetch(raceRequest('host'))
      const race = (await view.json() as { state: NumberGemRaceState }).state
      expect(race.scores.host + race.scores.guest).toBe(1)
      expect(race.decidedRounds).toBe(1)
    } finally { vi.restoreAllMocks() }
  })

  it('只接受合法玩家的一步，拒絕同版並發與換棋種', async () => {
    const room = createRoom()
    const initial = await room.fetch(request('host'))
    expect(initial.status).toBe(200)
    expect((await initial.json() as { gameId: string }).gameId).toBe('tic-tac-toe')
    const state = ticTacToeOnlineRules.initial()
    const next = ticTacToeOnlineRules.serialize(playTicTacToeMove(state, getLegalTicTacToeMoves(state)[0]!))
    expect((await room.fetch(request('guest', '/step', next))).status).toBe(400)
    const [first, second] = await Promise.all([
      room.fetch(request('host', '/step', next)), room.fetch(request('host', '/step', next)),
    ])
    expect([first.status, second.status].sort()).toEqual([200, 400])
    expect((await room.fetch(request('host', '', undefined, 0, 'gomoku'))).status).toBe(403)
    expect((await room.fetch(request('host')).then((response) => response.json()) as { revision: number }).revision).toBe(1)
  })

  it('公開入口以 Firebase token 與 match 棋種確認房間，忽略偽造的角色標頭', async () => {
    const room = createRoom()
    const stub = { fetch: vi.fn((next: Request) => room.fetch(next)) }
    const env = {
      TURN_GAME_ROOMS: { idFromName: (id: string) => id, get: () => stub },
      FIREBASE_API_KEY: 'public-test-key', FIREBASE_DATABASE_URL: 'https://demo.firebaseio.com',
      ALLOWED_ORIGIN: 'https://example.test',
    }
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => new Response(JSON.stringify(String(url).includes('accounts:lookup')
      ? { users: [{ localId: 'host-uid' }] }
      : { gameId: 'tic-tac-toe', hostUid: 'host-uid', guestUid: 'guest-uid', expiresAt }), { status: 200 })))
    try {
      const response = await worker.fetch(new Request('https://worker.test/rooms/test-room-123', {
        headers: { origin: 'https://example.test', authorization: 'Bearer token', 'x-game-uid': 'guest-uid', 'x-game-id': 'gomoku' },
      }), env)
      expect(response.status).toBe(200)
      expect(stub.fetch.mock.calls[0]![0].headers.get('x-game-uid')).toBe('host-uid')
      expect(stub.fetch.mock.calls[0]![0].headers.get('x-game-id')).toBe('tic-tac-toe')
      expect((await response.json() as { serialized: string }).serialized).toBe(createTurnRoom('tic-tac-toe').serialized)
      expect((await worker.fetch(new Request('https://worker.test/rooms/12345678', { headers: { origin: 'https://example.test', authorization: 'Bearer token' } }), env)).status).toBe(200)
      expect((await worker.fetch(new Request('https://worker.test/rooms/test-room-123', { headers: { origin: 'https://example.test' } }), env)).status).toBe(403)
    } finally {
      vi.stubGlobal('fetch', originalFetch)
      vi.unstubAllGlobals()
    }
  })
})
