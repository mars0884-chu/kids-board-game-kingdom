import { describe, expect, it, vi } from 'vitest'
import worker, { DarkChessRoom } from './dark-chess-worker'

function createRoom() {
  const values = new Map<string, unknown>()
  return new DarkChessRoom({ storage: {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => { values.set(key, value) },
    deleteAll: async () => { values.clear() },
    setAlarm: async () => {},
  } })
}

const expiresAt = Date.now() + 600000

function request(role: 'host' | 'guest', action?: unknown, expectedRevision = 0) {
  return new Request(`https://example.invalid/rooms/test-room-123${action ? '/action' : ''}`, {
    method: action ? 'POST' : 'GET',
    headers: { 'x-game-host': 'host-uid', 'x-game-guest': 'guest-uid', 'x-game-uid': role === 'host' ? 'host-uid' : 'guest-uid', 'x-game-expires': String(expiresAt) },
    body: action ? JSON.stringify({ action, expectedRevision }) : undefined,
  })
}

describe('暗棋可信房間回應', () => {
  it('GET 永遠只回公開棋面，乙不能搶先翻牌', async () => {
    const room = createRoom()
    const initial = await room.fetch(request('host'))
    const payload = await initial.json() as { revision: number; state: { board: { revealed: boolean; color: string | null; kind: string | null }[] } }
    expect(payload.revision).toBe(0)
    expect(payload.state.board.every((piece) => !piece.revealed && piece.color === null && piece.kind === null)).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('seed')
    const wrongTurn = await room.fetch(request('guest', { kind: 'flip', cell: 0 }))
    expect(wrongTurn.status).toBe(400)
    const flipped = await room.fetch(request('host', { kind: 'flip', cell: 0 }))
    expect(flipped.status).toBe(200)
    const newView = await flipped.json() as { revision: number; state: { board: { revealed: boolean; color: string | null }[] } }
    expect(newView.revision).toBe(1)
    expect(newView.state.board[0]?.revealed).toBe(true)
    expect(newView.state.board.slice(1).every((piece) => !piece.revealed && piece.color === null)).toBe(true)
  })

  it('同一版本的並發棋步只能成功一次', async () => {
    const room = createRoom()
    const [first, second] = await Promise.all([
      room.fetch(request('host', { kind: 'flip', cell: 0 })),
      room.fetch(request('host', { kind: 'flip', cell: 1 })),
    ])
    expect([first.status, second.status].sort()).toEqual([200, 400])
    const current = await room.fetch(request('host'))
    expect((await current.json() as { revision: number }).revision).toBe(1)
  })

  it('入口先驗證匿名 Firebase 身分與暗棋房間成員，不信任瀏覽器自稱角色', async () => {
    const room = createRoom()
    const stub = { fetch: vi.fn((next: Request) => room.fetch(next)) }
    const env = {
      DARK_CHESS_ROOMS: { idFromName: (id: string) => id, get: () => stub },
      FIREBASE_API_KEY: 'public-test-key', FIREBASE_DATABASE_URL: 'https://demo-kids-board-default-rtdb.firebaseio.com',
      ALLOWED_ORIGIN: 'https://example.test',
    }
    const originalFetch = globalThis.fetch
    const externalFetch = vi.fn(async (url: string | URL) => new Response(JSON.stringify(String(url).includes('accounts:lookup')
      ? { users: [{ localId: 'host-uid' }] }
      : { gameId: 'dark-chess', hostUid: 'host-uid', guestUid: 'guest-uid', expiresAt }), { status: 200 }))
    vi.stubGlobal('fetch', externalFetch)
    try {
      const base = new Request('https://worker.test/rooms/test-room-123', { headers: { origin: 'https://example.test', authorization: 'Bearer anonymous-token', 'x-game-uid': 'guest-uid' } })
      const response = await worker.fetch(base, env)
      expect(response.status).toBe(200)
      expect(stub.fetch.mock.calls[0]![0].headers.get('x-game-uid')).toBe('host-uid')
      expect(JSON.stringify(await response.json())).not.toContain('seed')
      expect((await worker.fetch(new Request('https://worker.test/rooms/12345678', { headers: { origin: 'https://example.test', authorization: 'Bearer anonymous-token' } }), env)).status).toBe(200)
      const denied = await worker.fetch(new Request('https://worker.test/rooms/test-room-123', { headers: { origin: 'https://example.test' } }), env)
      expect(denied.status).toBe(403)
      expect(stub.fetch).toHaveBeenCalledTimes(2)
    } finally {
      vi.stubGlobal('fetch', originalFetch)
      vi.unstubAllGlobals()
    }
  })
})
