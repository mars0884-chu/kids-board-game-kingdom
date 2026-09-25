import { onDisconnect, onValue, ref, set, type Database } from 'firebase/database'
import type { DarkChessAction, DarkChessPublicState } from '../games/dark-chess/rules'
import { getFirebaseServices, type FirebasePairingSession } from './firebase-pairing'

export interface DarkChessOnlineView { readonly revision: number; readonly state: DarkChessPublicState }

export interface FirebaseDarkChessSession {
  readonly transport: 'dark-chess-authority'
  readonly sessionId: string
  readonly role: 'host' | 'guest'
  readonly pairingControls: { report: () => Promise<void>; block: () => Promise<void> }
  subscribe(state: (view: DarkChessOnlineView) => void, connected: (value: boolean) => void): () => void
  submit(action: DarkChessAction, expectedRevision: number): Promise<void>
  restart(expectedRevision: number): Promise<void>
  close(): void
}

export async function createFirebaseDarkChessSession(
  database: Database,
  pairing: FirebasePairingSession,
  hostUid: string,
  guestUid: string,
  signal: AbortSignal,
  expiresAt: number,
): Promise<FirebaseDarkChessSession> {
  if (pairing.gameId !== 'dark-chess') throw new Error('房間與遊戲棋種不一致。')
  const baseUrl = import.meta.env.VITE_DARK_CHESS_WORKER_URL?.replace(/\/$/, '') ?? ''
  if (!baseUrl || (!baseUrl.startsWith('https://') && !(import.meta.env.DEV && baseUrl.startsWith('http://localhost:')))) throw new Error('暗棋連線服務尚未設定。')
  const services = await getFirebaseServices()
  if (services.user.uid !== pairing.uid) throw new Error('暗棋房間身分不一致。')
  const endpoint = `${baseUrl}/rooms/${encodeURIComponent(pairing.matchId)}`
  const peerUid = pairing.role === 'host' ? guestUid : hostUid
  const presenceRef = ref(database, `pairing/matches/${pairing.matchId}/presence/${pairing.uid}`)
  let closed = false
  let peerPresent = false
  let reachable = false
  let firebaseConnected = false
  let view: DarkChessOnlineView | null = null
  const stateListeners = new Set<(next: DarkChessOnlineView) => void>()
  const connectionListeners = new Set<(connected: boolean) => void>()
  const notifyConnection = () => connectionListeners.forEach((listener) => listener(!closed && firebaseConnected && reachable && peerPresent))
  const aborter = new AbortController()
  const unsubscribe: (() => void)[] = []
  let pollTimer = 0
  let expiryTimer = 0
  const close = () => {
    if (closed) return
    closed = true
    aborter.abort()
    window.clearInterval(pollTimer)
    window.clearTimeout(expiryTimer)
    unsubscribe.forEach((stop) => stop())
    signal.removeEventListener('abort', close)
    notifyConnection()
    void set(presenceRef, false).catch(() => undefined)
    void pairing.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', close, { once: true })
  expiryTimer = window.setTimeout(close, Math.max(0, expiresAt - Date.now()))
  if (signal.aborted) { close(); throw new Error('配對已取消。') }

  const request = async (path: string, body?: unknown): Promise<DarkChessOnlineView> => {
    const token = await services.user.getIdToken()
    const response = await fetch(endpoint + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: aborter.signal,
      cache: 'no-store',
    })
    const payload: unknown = await response.json()
    if (!response.ok) throw new Error(typeof payload === 'object' && payload !== null && 'error' in payload ? String(payload.error) : '暗棋連線暫時無法使用。')
    if (typeof payload !== 'object' || payload === null || !('revision' in payload) || !('state' in payload) || !Number.isSafeInteger(payload.revision)) throw new Error('暗棋局面格式錯誤。')
    return payload as DarkChessOnlineView
  }
  const update = (next: DarkChessOnlineView) => {
    if (closed || (view !== null && next.revision < view.revision)) return
    view = next
    reachable = true
    stateListeners.forEach((listener) => listener(next))
    notifyConnection()
  }
  const poll = async () => {
    if (closed) return
    try { update(await request('')) }
    catch { reachable = false; notifyConnection() }
  }

  try {
    await onDisconnect(presenceRef).set(false)
    update(await request(''))
    await set(presenceRef, true)
    unsubscribe.push(onValue(ref(database, `pairing/matches/${pairing.matchId}/presence/${peerUid}`), (snapshot) => {
      peerPresent = snapshot.val() === true
      notifyConnection()
    }, () => { peerPresent = false; notifyConnection() }))
    unsubscribe.push(onValue(ref(database, '.info/connected'), (snapshot) => {
      firebaseConnected = snapshot.val() === true
      if (!firebaseConnected) { reachable = false; notifyConnection(); return }
      void onDisconnect(presenceRef).set(false).then(() => set(presenceRef, true)).then(() => poll()).catch(() => { reachable = false; notifyConnection() })
    }))
    pollTimer = window.setInterval(() => { void poll() }, 4000)
    return {
      transport: 'dark-chess-authority', sessionId: pairing.matchId, role: pairing.role,
      pairingControls: { report: pairing.report, block: pairing.block },
      subscribe: (state, connected) => {
        stateListeners.add(state); connectionListeners.add(connected)
        if (view !== null) state(view)
        connected(!closed && firebaseConnected && reachable && peerPresent)
        return () => { stateListeners.delete(state); connectionListeners.delete(connected) }
      },
      submit: async (action, expectedRevision) => {
        if (closed || !firebaseConnected || !reachable || !peerPresent || view?.revision !== expectedRevision) throw new Error('局面已更新或連線中斷。')
        update(await request('/action', { action, expectedRevision }))
      },
      restart: async (expectedRevision) => {
        if (pairing.role !== 'host' || closed || !firebaseConnected || !reachable || !peerPresent) throw new Error('只有第一位玩家能重新開局或連線已中斷。')
        update(await request('/restart', { expectedRevision }))
      },
      close,
    }
  } catch (error) { close(); throw error }
}
