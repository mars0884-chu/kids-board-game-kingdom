import { get, onValue, ref, remove, runTransaction, set } from 'firebase/database'
import { getFirebaseServices, type FirebaseServices, type FirebasePairingSession } from './firebase-pairing'
import { createFirebaseGameSession, type FirebaseGameSession } from './firebase-game'

export const FRIEND_INVITE_TTL = 10 * 60 * 1000
export function normalizeFriendCode(value: string): string {
  return value.normalize('NFKC').replace(/[\s-]/g, '')
}
export function isFriendRoomCode(value: string): boolean { return /^\d{12}$/.test(normalizeFriendCode(value)) }
export function createFriendRoomCode(): string {
  // 十二位數分三組呈現；拒絕抽樣避免模數偏差，不使用時間或連號。
  let code = ''
  while (code.length < 12) {
    for (const value of crypto.getRandomValues(new Uint8Array(16))) {
      if (value < 250 && code.length < 12) code += String(value % 10)
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
export function friendInviteLink(id: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = new URLSearchParams({ friend: id }).toString()
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
function pairing(services: FirebaseServices, id: string, role: 'host' | 'guest'): FirebasePairingSession {
  let cancellation: Promise<void> | null = null
  return {
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
async function game(services: FirebaseServices, session: FirebasePairingSession, signal: AbortSignal): Promise<FirebaseGameSession> {
  assertActive(signal)
  const snapshot = await get(ref(services.database, 'pairing/matches/' + session.matchId))
  const match = snapshot.val()
  const serverNow = await friendServerNow(services, signal)
  if (!match || !match.guestUid || match.expiresAt <= serverNow) throw new Error('邀請已失效。')
  const connected = await createFirebaseGameSession(services.database, session, match.hostUid, match.guestUid, signal, Date.now() + match.expiresAt - serverNow)
  return { ...connected, pairingControls: undefined }
}
export async function createFriendInvitation(signal: AbortSignal, supplied?: FirebaseServices) {
  const services = supplied ?? await getFirebaseServices()
  assertActive(signal)
  let id = createFriendRoomCode()
  // 精確查詢不開放房間清單；撞號重新抽取，不能覆寫他人的房間。
  for (let attempt = 0; ; attempt++) {
    if (!(await get(ref(services.database, 'privateInvites/' + id))).exists()) break
    if (attempt >= 4) throw new Error('暫時無法建立邀請。')
    id = createFriendRoomCode()
  }
  const session = pairing(services, id, 'host')
  const createdAt = await friendServerNow(services, signal)
  const localDeadline = Date.now() + FRIEND_INVITE_TTL - 5000
  let created = false
  try {
    await set(ref(services.database, 'pairing/matches/' + id), {
      hostUid: services.user.uid, guestUid: '', hostTicketId: id + '-host', guestTicketId: id + '-guest',
      createdAt, expiresAt: createdAt + 2 * 60 * 60 * 1000,
    })
    created = true
    assertActive(signal)
    // 保留五秒傳輸／時間估算餘裕；服務端仍嚴格限制十分鐘，不放寬權限。
    await set(ref(services.database, 'privateInvites/' + id), { hostUid: services.user.uid, expiresAt: createdAt + FRIEND_INVITE_TTL - 5000 })
    assertActive(signal)
  } catch (error) { if (created) await session.cancel(); throw error }
  return {
    id, code: id, link: friendInviteLink(id), cancel: session.cancel,
    waitForGuest: async (): Promise<FirebaseGameSession> => {
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
        return await game(services, session, signal)
      } catch (error) {
        // 斷網時刪除會排隊，不能讓清理阻擋過期／取消提示。
        void session.cancel()
        throw error
      }
    },
  }
}
export async function joinFriendInvitation(id: string, signal: AbortSignal, supplied?: FirebaseServices): Promise<FirebaseGameSession> {
  if (isFriendRoomCode(id)) id = normalizeFriendCode(id)
  if (!isFriendInviteId(id)) throw new Error('邀請格式不正確。')
  const services = supplied ?? await getFirebaseServices()
  assertActive(signal)
  const invitation = (await get(ref(services.database, 'privateInvites/' + id))).val()
  if (!invitation || invitation.expiresAt <= await friendServerNow(services, signal)) throw new Error('邀請已過期。')
  if (invitation.hostUid === services.user.uid) throw new Error('請讓朋友開啟邀請。')
  assertActive(signal)
  const result = await runTransaction(ref(services.database, 'pairing/matches/' + id + '/guestUid'), (uid) => uid === null || uid === '' ? services.user.uid : undefined, { applyLocally: false })
  if (!result.committed) throw new Error('邀請已有人加入。')
  const session = pairing(services, id, 'guest')
  try { return await game(services, session, signal) }
  catch (error) { await session.cancel(); throw error }
}
