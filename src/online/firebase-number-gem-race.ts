import { onDisconnect, onValue, ref, set, type Database } from 'firebase/database'
import { getFirebaseServices, type FirebasePairingSession } from './firebase-pairing'
import type { NumberGemRaceState } from './number-gem-race-rules'

interface RaceView { gameId: 'number-gem'; revision: number; state: NumberGemRaceState; serverNow: number }

export interface NumberGemRaceSession {
  readonly role: 'host' | 'guest'
  readonly sessionId: string
  readonly pairingControls: { report: () => Promise<void>; block: () => Promise<void> }
  subscribe(state: (next: NumberGemRaceState) => void, connected: (value: boolean) => void): () => void
  ready(): Promise<void>
  solve(path: readonly number[]): Promise<void>
  restart(): Promise<void>
  serverNow(): number
  close(): void
}

/** Firebase 僅作配對、在線與小型版本通知；題目計時、正解和比分皆由可信 Worker 決定。 */
export async function createFirebaseNumberGemRaceSession(database: Database, pairing: FirebasePairingSession,
  hostUid: string, guestUid: string, signal: AbortSignal, expiresAt = Date.now() + 2 * 60 * 60 * 1000): Promise<NumberGemRaceSession> {
  if (pairing.gameId !== 'number-gem') throw new Error('房間與遊戲棋種不一致。')
  const baseUrl = import.meta.env.VITE_TURN_GAME_WORKER_URL?.replace(/\/$/, '') ?? ''
  if (!baseUrl || (!baseUrl.startsWith('https://') && !(import.meta.env.DEV && baseUrl.startsWith('http://localhost:')))) throw new Error('棋局連線服務尚未設定。')
  const services = await getFirebaseServices()
  if (services.user.uid !== pairing.uid) throw new Error('房間身分不一致。')
  const endpoint = `${baseUrl}/rooms/${encodeURIComponent(pairing.matchId)}/race`
  const peerUid = pairing.role === 'host' ? guestUid : hostUid
  const presenceRef = ref(database, `pairing/matches/${pairing.matchId}/presence/${pairing.uid}`)
  const signalRef = ref(database, `pairing/matches/${pairing.matchId}/revisionSignals/${pairing.uid}`)
  let closed = false
  let workerReachable = false
  let firebaseConnected = false
  let peerPresent = false
  let clockOffset = 0
  let view: RaceView | null = null
  let pollInFlight = false
  let pollTimer = 0
  let expiryTimer = 0
  const stateListeners = new Set<(state: NumberGemRaceState) => void>()
  const connectedListeners = new Set<(connected: boolean) => void>()
  const unsubscribers: (() => void)[] = []
  const aborter = new AbortController()
  const isConnected = () => !closed && workerReachable && firebaseConnected && peerPresent
  const notifyConnected = () => connectedListeners.forEach((listener) => listener(isConnected()))
  const close = () => {
    if (closed) return
    closed = true
    aborter.abort()
    window.clearInterval(pollTimer)
    window.clearTimeout(expiryTimer)
    unsubscribers.forEach((stop) => stop())
    signal.removeEventListener('abort', close)
    notifyConnected()
    void set(presenceRef, false).catch(() => undefined)
    void pairing.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', close, { once: true })
  expiryTimer = window.setTimeout(close, Math.max(0, expiresAt - Date.now()))
  if (signal.aborted) { close(); throw new Error('配對已取消。') }

  const request = async (path = '', body?: unknown): Promise<RaceView> => {
    const response = await fetch(endpoint + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${await services.user.getIdToken()}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: aborter.signal, cache: 'no-store',
    })
    const payload: unknown = await response.json()
    if (!response.ok) throw new Error(typeof payload === 'object' && payload !== null && 'error' in payload ? String(payload.error) : '搶答服務暫時無法使用。')
    if (typeof payload !== 'object' || payload === null || !('gameId' in payload) || payload.gameId !== 'number-gem' ||
      !('revision' in payload) || !Number.isSafeInteger(payload.revision) || !('serverNow' in payload) || typeof payload.serverNow !== 'number' ||
      !('state' in payload) || typeof payload.state !== 'object' || payload.state === null || !('version' in payload.state) || payload.state.version !== 1) {
      throw new Error('搶答局面格式不正確。')
    }
    return payload as RaceView
  }
  const update = (next: RaceView) => {
    if (closed) return
    clockOffset = Date.now() - next.serverNow
    workerReachable = true
    notifyConnected()
    if (view !== null && next.revision <= view.revision) return
    view = next
    stateListeners.forEach((listener) => listener(next.state))
  }
  const poll = async () => {
    if (closed || pollInFlight) return
    pollInFlight = true
    try { update(await request()) }
    catch { workerReachable = false; notifyConnected() }
    finally { pollInFlight = false }
  }
  const announce = (revision: number) => { void set(signalRef, revision).catch(() => undefined) }
  const mutate = async (path: string, body: unknown) => {
    if (!isConnected()) throw new Error('連線中斷。')
    try { const accepted = await request(path, body); update(accepted); announce(accepted.revision) }
    catch (error) { await poll(); throw error }
  }

  try {
    await onDisconnect(presenceRef).set(false)
    update(await request())
    await set(presenceRef, true)
    unsubscribers.push(onValue(ref(database, `pairing/matches/${pairing.matchId}/presence/${peerUid}`), (snapshot) => {
      peerPresent = snapshot.val() === true
      notifyConnected()
    }, () => { peerPresent = false; notifyConnected() }))
    unsubscribers.push(onValue(ref(database, `pairing/matches/${pairing.matchId}/revisionSignals/${peerUid}`), (snapshot) => {
      const revision: unknown = snapshot.val()
      if (typeof revision === 'number' && Number.isSafeInteger(revision) && (view === null || revision > view.revision)) void poll()
    }))
    unsubscribers.push(onValue(ref(database, '.info/connected'), (snapshot) => {
      firebaseConnected = snapshot.val() === true
      if (!firebaseConnected) { workerReachable = false; notifyConnected(); return }
      void onDisconnect(presenceRef).set(false).then(() => set(presenceRef, true)).then(() => poll()).catch(() => {
        workerReachable = false; notifyConnected()
      })
    }))
    pollTimer = window.setInterval(() => { void poll() }, 4000)
    return {
      role: pairing.role, sessionId: pairing.matchId,
      pairingControls: { report: pairing.report, block: pairing.block },
      subscribe: (state, connected) => {
        stateListeners.add(state); connectedListeners.add(connected)
        if (view !== null) state(view.state)
        connected(isConnected())
        return () => { stateListeners.delete(state); connectedListeners.delete(connected) }
      },
      ready: () => mutate('/ready', {}),
      solve: (path) => mutate('/solve', { path }),
      restart: () => pairing.role === 'host' ? mutate('/restart', {}) : Promise.reject(new Error('只有第一位玩家能重新開局。')),
      serverNow: () => Date.now() - clockOffset,
      close,
    }
  } catch (error) { close(); throw error }
}
