import { applyTurnRoomStep, createTurnRoom, isTrustedTurnGameId, restartTurnRoom, type TrustedTurnGameId, type TurnRoomRecord } from './turn-game-authority'

interface RoomStore {
  readonly record: TurnRoomRecord
  readonly hostUid: string
  readonly guestUid: string
  readonly expiresAt: number
}

interface DurableStore {
  storage: { get<T>(key: string): Promise<T | undefined>; put<T>(key: string, value: T): Promise<void>; deleteAll(): Promise<void>; setAlarm(time: number): Promise<void> }
}

interface RoomStub { fetch(request: Request): Promise<Response> }
interface RoomNamespace { idFromName(name: string): unknown; get(id: unknown): RoomStub }
interface WorkerEnvironment {
  readonly TURN_GAME_ROOMS: RoomNamespace
  readonly FIREBASE_API_KEY: string
  readonly FIREBASE_DATABASE_URL: string
  readonly ALLOWED_ORIGIN: string
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

export class TurnGameRoom {
  private pending: Promise<void> = Promise.resolve()
  constructor(private readonly state: DurableStore) {}

  async alarm(): Promise<void> { await this.state.storage.deleteAll() }

  async fetch(request: Request): Promise<Response> {
    const previous = this.pending
    let release = () => {}
    this.pending = new Promise<void>((resolve) => { release = resolve })
    await previous
    try { return await this.handle(request) }
    finally { release() }
  }

  private async handle(request: Request): Promise<Response> {
    const hostUid = request.headers.get('x-game-host') ?? ''
    const guestUid = request.headers.get('x-game-guest') ?? ''
    const uid = request.headers.get('x-game-uid') ?? ''
    const gameId = request.headers.get('x-game-id')
    const expiresAt = Number(request.headers.get('x-game-expires'))
    if (!hostUid || !guestUid || hostUid === guestUid || (uid !== hostUid && uid !== guestUid) ||
      !isTrustedTurnGameId(gameId) || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return json({ error: '房間已失效。' }, 403)
    const role = uid === hostUid ? 'host' : 'guest'
    let stored = await this.state.storage.get<RoomStore>('room')
    if (stored === undefined) {
      stored = { record: createTurnRoom(gameId), hostUid, guestUid, expiresAt }
      await this.state.storage.put('room', stored)
      await this.state.storage.setAlarm(expiresAt)
    } else if (stored.hostUid !== hostUid || stored.guestUid !== guestUid || stored.expiresAt !== expiresAt || stored.record.gameId !== gameId) {
      return json({ error: '房間成員或棋種不一致。' }, 403)
    }
    if (request.method === 'GET') return json(stored.record)
    if (request.method !== 'POST') return json({ error: '不支援此操作。' }, 405)
    try {
      const bodyText = await request.text()
      if (bodyText.length > 140000) throw new Error('棋局資料過長。')
      const input: unknown = JSON.parse(bodyText)
      if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('棋局格式不正確。')
      const body = input as Record<string, unknown>
      if (!Number.isSafeInteger(body.expectedRevision)) throw new Error('缺少正確的棋局版本。')
      const path = new URL(request.url).pathname
      const record = path.endsWith('/step')
        ? typeof body.serialized === 'string' ? applyTurnRoomStep(stored.record, role, body.expectedRevision as number, body.serialized) : null
        : path.endsWith('/restart') ? restartTurnRoom(stored.record, role, body.expectedRevision as number) : null
      if (record === null) throw new Error('棋局格式或操作不正確。')
      stored = { ...stored, record }
      await this.state.storage.put('room', stored)
      return json(record)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : '棋局操作失敗。' }, 400)
    }
  }
}

async function authenticatedMatch(request: Request, env: WorkerEnvironment, matchId: string): Promise<{ uid: string; hostUid: string; guestUid: string; gameId: TrustedTurnGameId; expiresAt: number } | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) return null
  const auth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  })
  if (!auth.ok) return null
  const identity = await auth.json() as { users?: { localId?: string }[] }
  const uid = identity.users?.[0]?.localId
  if (!uid) return null
  const address = new URL(`${env.FIREBASE_DATABASE_URL.replace(/\/$/, '')}/pairing/matches/${matchId}.json`)
  address.searchParams.set('auth', token)
  const response = await fetch(address)
  if (!response.ok) return null
  const match = await response.json() as Record<string, unknown> | null
  if (!match || !isTrustedTurnGameId(match.gameId) ||
    (match.hostUid !== uid && match.guestUid !== uid) ||
    typeof match.hostUid !== 'string' || typeof match.guestUid !== 'string' || !match.guestUid || match.hostUid === match.guestUid ||
    typeof match.expiresAt !== 'number' || !Number.isSafeInteger(match.expiresAt) || match.expiresAt <= Date.now()) return null
  return { uid, hostUid: match.hostUid, guestUid: match.guestUid, gameId: match.gameId, expiresAt: match.expiresAt }
}

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    const origin = request.headers.get('origin')
    const cors = origin === env.ALLOWED_ORIGIN ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type', vary: 'Origin' } : null
    if (request.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors ?? undefined })
    if (!cors) return json({ error: '來源不允許。' }, 403)
    const match = new URL(request.url).pathname.match(/^\/rooms\/([A-Za-z0-9_-]{12,80})(?:\/(step|restart))?$/)
    if (!match || !env.FIREBASE_API_KEY || !env.FIREBASE_DATABASE_URL || !env.TURN_GAME_ROOMS) return withCors(json({ error: '回合服務尚未設定。' }, 503), cors)
    try {
      const member = await authenticatedMatch(request, env, match[1]!)
      if (!member) return withCors(json({ error: '房間身分驗證失敗。' }, 403), cors)
      const headers = new Headers(request.headers)
      headers.set('x-game-uid', member.uid)
      headers.set('x-game-host', member.hostUid)
      headers.set('x-game-guest', member.guestUid)
      headers.set('x-game-id', member.gameId)
      headers.set('x-game-expires', String(member.expiresAt))
      const stub = env.TURN_GAME_ROOMS.get(env.TURN_GAME_ROOMS.idFromName(match[1]!))
      return withCors(await stub.fetch(new Request(request, { headers })), cors)
    } catch { return withCors(json({ error: '回合服務暫時無法使用。' }, 503), cors) }
  },
}

function withCors(response: Response, cors: Record<string, string>): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(cors)) headers.set(key, value)
  return new Response(response.body, { status: response.status, headers })
}
