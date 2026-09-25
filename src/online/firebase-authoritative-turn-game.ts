import { onDisconnect, onValue, ref, set, type Database } from 'firebase/database'
import type { FirebasePairingSession } from './firebase-pairing'
import { getFirebaseServices } from './firebase-pairing'
import type { OnlineGameId } from './game-id'
import type { OnlineTurnRules } from './turn-rules'

export interface AuthoritativeTurnSession<State> {
  readonly transport: 'turn-authority'
  readonly gameId: OnlineGameId
  readonly sessionId: string
  readonly role: 'host' | 'guest'
  readonly pairingControls: { report: () => Promise<void>; block: () => Promise<void> }
  subscribe(state: (next: State) => void, connected: (value: boolean) => void): () => void
  submit(next: State): Promise<void>
  restart(): Promise<void>
  close(): void
}

interface RoomView { gameId: OnlineGameId; revision: number; serialized: string }

/** Firebase 僅供配對與在線狀態；棋局只由可信 Worker 保存及驗證。 */
export async function createFirebaseAuthoritativeTurnSession<State>(
  database: Database,
  pairing: FirebasePairingSession,
  gameId: OnlineGameId,
  hostUid: string,
  guestUid: string,
  signal: AbortSignal,
  rules: OnlineTurnRules<State>,
  expiresAt = Date.now() + 2 * 60 * 60 * 1000,
): Promise<AuthoritativeTurnSession<State>> {
  if (pairing.gameId !== gameId || gameId === 'jump-chess' || gameId === 'dark-chess') throw new Error('房間與遊戲棋種不一致。')
  const baseUrl = import.meta.env.VITE_TURN_GAME_WORKER_URL?.replace(/\/$/, '') ?? ''
  if (!baseUrl || (!baseUrl.startsWith('https://') && !(import.meta.env.DEV && baseUrl.startsWith('http://localhost:')))) throw new Error('棋局連線服務尚未設定。')
  const services = await getFirebaseServices()
  if (services.user.uid !== pairing.uid) throw new Error('房間身分不一致。')
  const endpoint = `${baseUrl}/rooms/${encodeURIComponent(pairing.matchId)}`
  const peerUid = pairing.role === 'host' ? guestUid : hostUid
  const presenceRef = ref(database, `pairing/matches/${pairing.matchId}/presence/${pairing.uid}`)
  const revisionSignalRef = ref(database, `pairing/matches/${pairing.matchId}/revisionSignals/${pairing.uid}`)
  let closed = false
  let workerReachable = false
  let firebaseConnected = false
  let peerPresent = false
  let view: RoomView | null = null
  let current: State | null = null
  const stateListeners = new Set<(next: State) => void>()
  const connectionListeners = new Set<(value: boolean) => void>()
  const unsubscribe: (() => void)[] = []
  const aborter = new AbortController()
  let pollTimer = 0
  let pollInFlight = false
  let expiryTimer = 0
  const isConnected = () => !closed && workerReachable && firebaseConnected && peerPresent
  const notifyConnection = () => connectionListeners.forEach((listener) => listener(isConnected()))
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

  const request = async (path: string, body?: unknown): Promise<RoomView> => {
    const response = await fetch(endpoint + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${await services.user.getIdToken()}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: aborter.signal,
      cache: 'no-store',
    })
    const payload: unknown = await response.json()
    if (!response.ok) throw new Error(typeof payload === 'object' && payload !== null && 'error' in payload ? String(payload.error) : '棋局連線暫時無法使用。')
    if (typeof payload !== 'object' || payload === null || !('gameId' in payload) || payload.gameId !== gameId ||
      !('revision' in payload) || !Number.isSafeInteger(payload.revision) || !('serialized' in payload) || typeof payload.serialized !== 'string') throw new Error('棋局資料格式錯誤。')
    return payload as RoomView
  }
  const update = (next: RoomView) => {
    if (closed) return
    workerReachable = true
    notifyConnection()
    if (view !== null && next.revision <= view.revision) return
    const state = rules.deserialize(next.serialized)
    if (rules.serialize(state) !== next.serialized) throw new Error('棋局資料不一致。')
    view = next
    current = state
    stateListeners.forEach((listener) => listener(state))
  }
  const poll = async () => {
    if (closed || pollInFlight) return
    pollInFlight = true
    try { update(await request('')) }
    catch { workerReachable = false; notifyConnection() }
    finally { pollInFlight = false }
  }
  const announce = (revision: number) => { void set(revisionSignalRef, revision).catch(() => undefined) }

  try {
    await onDisconnect(presenceRef).set(false)
    update(await request(''))
    await set(presenceRef, true)
    unsubscribe.push(onValue(ref(database, `pairing/matches/${pairing.matchId}/presence/${peerUid}`), (snapshot) => {
      peerPresent = snapshot.val() === true
      notifyConnection()
    }, () => { peerPresent = false; notifyConnection() }))
    unsubscribe.push(onValue(ref(database, `pairing/matches/${pairing.matchId}/revisionSignals/${peerUid}`), (snapshot) => {
      const revision: unknown = snapshot.val()
      if (typeof revision === 'number' && Number.isSafeInteger(revision) && (view === null || revision > view.revision)) void poll()
    }))
    unsubscribe.push(onValue(ref(database, '.info/connected'), (snapshot) => {
      firebaseConnected = snapshot.val() === true
      if (!firebaseConnected) { workerReachable = false; notifyConnection(); return }
      void onDisconnect(presenceRef).set(false).then(() => set(presenceRef, true)).then(() => poll()).catch(() => {
        workerReachable = false; notifyConnection()
      })
    }))
    pollTimer = window.setInterval(() => { void poll() }, 4000)
    return {
      transport: 'turn-authority', gameId, sessionId: pairing.matchId, role: pairing.role,
      pairingControls: { report: pairing.report, block: pairing.block },
      subscribe: (state, connected) => {
        stateListeners.add(state); connectionListeners.add(connected)
        if (current !== null) state(current)
        connected(isConnected())
        return () => { stateListeners.delete(state); connectionListeners.delete(connected) }
      },
      submit: async (next) => {
        if (!isConnected() || view === null || current === null) throw new Error('連線中斷。')
        if (rules.currentRole(current) !== pairing.role || !rules.isLegalStep(current, next)) throw new Error('不合法的棋步。')
        const expectedRevision = view.revision
        try { const accepted = await request('/step', { expectedRevision, serialized: rules.serialize(next) }); update(accepted); announce(accepted.revision) }
        catch (error) { await poll(); throw error }
      },
      restart: async () => {
        if (pairing.role !== 'host' || !isConnected() || view === null) throw new Error('只有第一位玩家能重新開局。')
        const expectedRevision = view.revision
        try { const accepted = await request('/restart', { expectedRevision }); update(accepted); announce(accepted.revision) }
        catch (error) { await poll(); throw error }
      },
      close,
    }
  } catch (error) { close(); throw error }
}
