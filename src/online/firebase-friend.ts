import { get, onValue, ref, remove, runTransaction, set, type Database } from 'firebase/database'
import { getFirebaseServices, type FirebaseServices, type FirebasePairingSession } from './firebase-pairing'
import { createFirebaseGameSession, type FirebaseGameSession } from './firebase-game'
import { isOnlineGameId, matchesOnlineGame, type OnlineGameId } from './game-id'

export const FRIEND_INVITE_TTL = 10 * 60 * 1000
export type FirebaseRoomFactory<Session> = (
  database: Database,
  pairing: FirebasePairingSession,
  hostUid: string,
  guestUid: string,
  signal: AbortSignal,
  expiresAt: number,
) => Promise<Session>
export function normalizeFriendCode(value: string): string {
  return value.normalize('NFKC').replace(/[\s-]/g, '')
}
export function isFriendRoomCode(value: string): boolean { return /^(?:\d{8}|\d{12})$/.test(normalizeFriendCode(value)) }
export function createFriendRoomCode(): string {
  // 新房號八位數；舊版十二位數仍可加入。拒絕抽樣避免模數偏差。
  let code = ''
  while (code.length < 8) {
    for (const value of crypto.getRandomValues(new Uint8Array(16))) {
      if (value < 250 && code.length < 8) code += String(value % 10)
    }
  }
  return code
}
export function isFriendInviteId(value: string): boolean {
  return isFriendRoomCode(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
export function readFriendInvite(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get('friend')
}
export function friendInviteLink(id: string, gameId: OnlineGameId = 'jump-chess'): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = new URLSearchParams({ friend: id, game: gameId }).toString()
  return url.toString()
}
function assertActive(signal: AbortSignal) {
  if (signal.aborted) throw new Error('邀請已取消。')
}
export async function friendServerNow(services: FirebaseServices, signal: AbortSignal): Promise<number> {
  assertActive(signal)
  // .info 是即時連線中繼資料，不能使用 REST 型 get 讀取。
  await new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {}
    let done = false
    const finish = (error?: Error) => {
      if (done) return
      done = true; unsubscribe(); signal.removeEventListener('abort', abort)
      if (error) reject(error); else resolve()
    }
    const abort = () => finish(new Error('邀請已取消。'))
    signal.addEventListener('abort', abort, { once: true })
    unsubscribe = onValue(ref(services.database, '.info/connected'), snapshot => { if (snapshot.val() === true) finish() }, finish)
    if (done) unsubscribe()
  })
  const offset = await new Promise<number>((resolve, reject) => {
    onValue(ref(services.database, '.info/serverTimeOffset'), snapshot => resolve(Number(snapshot.val()) || 0), reject, { onlyOnce: true })
  })
  assertActive(signal)
  return Date.now() + offset
}
function pairing(services: FirebaseServices, id: string, role: 'host' | 'guest', gameId: OnlineGameId): FirebasePairingSession {
  let cancellation: Promise<void> | null = null
  return {
    gameId,
    hostUid: role === 'host' ? services.user.uid : '',
    guestUid: role === 'guest' ? services.user.uid : '',
    expiresAt: 0,
    uid: services.user.uid, ticketId: id, matchId: id, role,
    createGame: async () => { throw new Error('請使用熟人邀請流程。') },
    publishOffer: async () => { throw new Error('不使用 WebRTC。') },
    publishAnswer: async () => { throw new Error('不使用 WebRTC。') },
    waitForOffer: async () => { throw new Error('不使用 WebRTC。') },
    waitForAnswer: async () => { throw new Error('不使用 WebRTC。') },
    // 熟人模式不提供匿名配對的檢舉／封鎖入口。
    report: async () => {}, block: async () => {},
    cancel: () => {
      cancellation ??= (async () => {
        await remove(ref(services.database, 'privateInvites/' + id)).catch(() => undefined)
        await remove(ref(services.database, 'pairing/matches/' + id)).catch(() => undefined)
      })()
      return cancellation
    },
  }
}
async function game<Session>(services: FirebaseServices, session: FirebasePairingSession, signal: AbortSignal, factory: FirebaseRoomFactory<Session>): Promise<Session> {
  assertActive(signal)
  const snapshot = await get(ref(services.database, 'pairing/matches/' + session.matchId))
  const match = snapshot.val()
  const serverNow = await friendServerNow(services, signal)
  if (!match || !match.guestUid || match.expiresAt <= serverNow) throw new Error('邀請已失效。')
  if (!matchesOnlineGame(match.gameId, session.gameId)) throw new Error('邀請的棋種不一致。')
  const connected = await factory(services.database, session, match.hostUid, match.guestUid, signal, Date.now() + match.expiresAt - serverNow)
  return { ...connected, pairingControls: undefined }
}
export async function createFriendInvitation<Session = FirebaseGameSession>(
  signal: AbortSignal,
  supplied?: FirebaseServices,
  gameId: OnlineGameId = 'jump-chess',
  factory: FirebaseRoomFactory<Session> = createFirebaseGameSession as FirebaseRoomFactory<Session>,
) {
  const services = supplied ?? await getFirebaseServices()
  assertActive(signal)
  const createdAt = await friendServerNow(services, signal)
  const localDeadline = Date.now() + FRIEND_INVITE_TTL - 5000
  let id = ''
  let created = false
  // 八碼撞號時重新抽取；資料庫建立規則只允許 !data.exists()，並發建立不會覆寫。
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assertActive(signal)
    id = createFriendRoomCode()
    if ((await get(ref(services.database, 'privateInvites/' + id))).exists()) continue
    try {
      await set(ref(services.database, 'pairing/matches/' + id), {
        gameId,
        hostUid: services.user.uid, guestUid: '', hostTicketId: id + '-host', guestTicketId: id + '-guest',
        createdAt, expiresAt: createdAt + 2 * 60 * 60 * 1000,
      })
      created = true
      break
    } catch (error) {
      // 已存在但不屬於自己的房間讀取會被 Firebase 規則拒絕，視為撞號。
      if (typeof error !== 'object' || error === null || !('code' in error) ||
        !String(error.code).toLowerCase().includes('permission-denied')) throw error
    }
  }
  if (!created) throw new Error('暫時無法建立邀請。')
  const session = pairing(services, id, 'host', gameId)
  try {
    assertActive(signal)
    // 保留五秒傳輸／時間估算餘裕；服務端仍嚴格限制十分鐘，不放寬權限。
    await set(ref(services.database, 'privateInvites/' + id), { hostUid: services.user.uid, expiresAt: createdAt + FRIEND_INVITE_TTL - 5000 })
    assertActive(signal)
  } catch (error) { if (created) await session.cancel(); throw error }
  return {
    id, code: id, link: friendInviteLink(id, gameId), cancel: session.cancel,
    waitForGuest: async (): Promise<Session> => {
      try {
        await new Promise<void>((resolve, reject) => {
          let unsubscribe = () => {}
          let done = false
          const finish = (error?: Error) => {
            if (done) return
            done = true
            window.clearTimeout(timer); signal.removeEventListener('abort', abort); unsubscribe()
            if (error) reject(error); else resolve()
          }
          const abort = () => finish(new Error('邀請已取消。'))
          const timer = window.setTimeout(() => finish(new Error('邀請已過期。')), Math.max(0, localDeadline - Date.now()))
          signal.addEventListener('abort', abort, { once: true })
          if (signal.aborted) { abort(); return }
          unsubscribe = onValue(ref(services.database, 'pairing/matches/' + id), (snapshot) => {
            const value = snapshot.val()
            if (!value) finish(new Error('朋友已離開。'))
            else if (value.guestUid) finish()
          }, (error) => finish(error))
          if (done) unsubscribe()
        })
        return await game(services, session, signal, factory)
      } catch (error) {
        // 斷網時刪除會排隊，不能讓清理阻擋過期／取消提示。
        void session.cancel()
        throw error
      }
    },
  }
}
export async function joinFriendInvitation<Session = FirebaseGameSession>(
  id: string,
  signal: AbortSignal,
  supplied?: FirebaseServices,
  expectedGameId: OnlineGameId = 'jump-chess',
  factory: FirebaseRoomFactory<Session> = createFirebaseGameSession as FirebaseRoomFactory<Session>,
): Promise<Session> {
  if (isFriendRoomCode(id)) id = normalizeFriendCode(id)
  if (!isFriendInviteId(id)) throw new Error('邀請格式不正確。')
  const services = supplied ?? await getFirebaseServices()
  assertActive(signal)
  const invitation = (await get(ref(services.database, 'privateInvites/' + id))).val()
  if (!invitation || invitation.expiresAt <= await friendServerNow(services, signal)) throw new Error('邀請已過期。')
  if (invitation.hostUid === services.user.uid) throw new Error('請讓朋友開啟邀請。')
  // 加入前不可讀取整筆房間；只公開尚未被使用邀請的棋種，以免錯誤棋種先占用加入名額。
  const matchGameId = (await get(ref(services.database, 'pairing/matches/' + id + '/gameId'))).val()
  if (!isOnlineGameId(matchGameId) || !matchesOnlineGame(matchGameId, expectedGameId)) throw new Error('邀請的棋種不一致。')
  assertActive(signal)
  const result = await runTransaction(ref(services.database, 'pairing/matches/' + id + '/guestUid'), (uid) => uid === null || uid === '' ? services.user.uid : undefined, { applyLocally: false })
  if (!result.committed) throw new Error('邀請已有人加入。')
  const session = pairing(services, id, 'guest', expectedGameId)
  try { return await game(services, session, signal, factory) }
  catch (error) { await session.cancel(); throw error }
}
