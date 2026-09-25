import { applyDarkChessRoomAction, createDarkChessRoom, publicDarkChessRoom, restartDarkChessRoom, type DarkChessRoomRecord } from './dark-chess-authority'
import type { DarkChessAction } from '../src/games/dark-chess/rules'

interface RoomStore {
  readonly record: DarkChessRoomRecord
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
  readonly DARK_CHESS_ROOMS: RoomNamespace
  readonly FIREBASE_API_KEY: string
  readonly FIREBASE_DATABASE_URL: string
  readonly ALLOWED_ORIGIN: string
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

function actionFrom(value: unknown): DarkChessAction {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('暗棋行動格式不正確。')
  const action = value as Record<string, unknown>
  if (action.kind === 'flip' && Number.isInteger(action.cell)) return { kind: 'flip', cell: action.cell as number }
  if ((action.kind === 'move' || action.kind === 'capture') && Number.isInteger(action.from) && Number.isInteger(action.to)) return { kind: action.kind, from: action.from as number, to: action.to as number }
  if (action.kind === 'draw-offer') return { kind: 'draw-offer' }
  if (action.kind === 'draw-response' && (action.response === 'accept' || action.response === 'reject')) return { kind: 'draw-response', response: action.response }
  throw new Error('暗棋行動格式不正確。')
}

function freshSeed(): number {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return bytes[0]!
}

export class DarkChessRoom {
  private pending: Promise<void> = Promise.resolve()
  constructor(private readonly state: DurableStore) {}

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll()
  }

  async fetch(request: Request): Promise<Response> {
    // 同一房間的兩筆棋步必須依序讀取與寫入，避免兩個相同版本同時通過。
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
    const expiresAt = Number(request.headers.get('x-game-expires'))
    if (!hostUid || !guestUid || (uid !== hostUid && uid !== guestUid) || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return json({ error: '房間已失效。' }, 403)
    const role = uid === hostUid ? 'host' : 'guest'
    let stored = await this.state.storage.get<RoomStore>('room')
    if (stored === undefined) {
      stored = { record: createDarkChessRoom(freshSeed()), hostUid, guestUid, expiresAt }
      await this.state.storage.put('room', stored)
      await this.state.storage.setAlarm(expiresAt)
    } else if (stored.hostUid !== hostUid || stored.guestUid !== guestUid || stored.expiresAt !== expiresAt) {
      return json({ error: '房間成員不一致。' }, 403)
    }
    try {
      if (request.method === 'GET') return json(publicDarkChessRoom(stored.record))
      if (request.method !== 'POST') return json({ error: '不支援此操作。' }, 405)
      const url = new URL(request.url)
      const text = await request.text()
      if (text.length > 2048) throw new Error('暗棋行動資料過長。')
      const body: unknown = JSON.parse(text)
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('暗棋行動格式不正確。')
      const input = body as Record<string, unknown>
      if (url.pathname.endsWith('/action')) {
        if (!Number.isSafeInteger(input.expectedRevision)) throw new Error('缺少正確的棋局版本。')
        stored = { ...stored, record: applyDarkChessRoomAction(stored.record, role, input.expectedRevision as number, actionFrom(input.action)) }
      } else if (url.pathname.endsWith('/restart')) {
        if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== stored.record.revision) throw new Error('局面已更新，請重新選擇棋步。')
        stored = { ...stored, record: restartDarkChessRoom(stored.record, role, freshSeed()) }
      } else return json({ error: '不支援此操作。' }, 404)
      await this.state.storage.put('room', stored)
      return json(publicDarkChessRoom(stored.record))
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : '暗棋行動失敗。' }, 400)
    }
  }
}

async function authenticatedMatch(request: Request, env: WorkerEnvironment, matchId: string): Promise<{ uid: string; hostUid: string; guestUid: string; expiresAt: number } | null> {
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
  if (!match || match.gameId !== 'dark-chess' || match.hostUid !== uid && match.guestUid !== uid ||
    typeof match.hostUid !== 'string' || typeof match.guestUid !== 'string' || !match.guestUid ||
    typeof match.expiresAt !== 'number' || !Number.isSafeInteger(match.expiresAt) || match.expiresAt <= Date.now()) return null
  return { uid, hostUid: match.hostUid, guestUid: match.guestUid, expiresAt: match.expiresAt }
}

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    const origin = request.headers.get('origin')
    const cors = origin === env.ALLOWED_ORIGIN ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type', vary: 'Origin' } : null
    if (request.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors ?? undefined })
    if (!cors) return json({ error: '來源不允許。' }, 403)
    const match = new URL(request.url).pathname.match(/^\/rooms\/((?:\d{8}|[A-Za-z0-9_-]{12,80}))(?:\/(action|restart))?$/)
    if (!match || !env.FIREBASE_API_KEY || !env.FIREBASE_DATABASE_URL || !env.DARK_CHESS_ROOMS) return new Response(JSON.stringify({ error: '暗棋服務尚未設定。' }), { status: 503, headers: cors })
    try {
      const member = await authenticatedMatch(request, env, match[1]!)
      if (!member) return new Response(JSON.stringify({ error: '房間身分驗證失敗。' }), { status: 403, headers: cors })
      const headers = new Headers(request.headers)
      headers.set('x-game-uid', member.uid)
      headers.set('x-game-host', member.hostUid)
      headers.set('x-game-guest', member.guestUid)
      headers.set('x-game-expires', String(member.expiresAt))
      const forward = new Request(request, { headers })
      const stub = env.DARK_CHESS_ROOMS.get(env.DARK_CHESS_ROOMS.idFromName(match[1]!))
      const result = await stub.fetch(forward)
      const returned = new Headers(result.headers)
      for (const [name, value] of Object.entries(cors)) returned.set(name, value)
      return new Response(result.body, { status: result.status, headers: returned })
    } catch {
      return new Response(JSON.stringify({ error: '暗棋服務暫時無法使用。' }), { status: 503, headers: cors })
    }
  },
}
