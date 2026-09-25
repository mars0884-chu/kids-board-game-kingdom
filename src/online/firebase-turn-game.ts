import { get, onDisconnect, onValue, ref, runTransaction, set, type Database } from 'firebase/database'
import type { FirebasePairingSession } from './firebase-pairing'
import type { OnlineGameId } from './game-id'
import type { OnlineTurnRules } from './turn-rules'

interface BoardRecord { revision: number; serialized: string; initial: string; nextUid: string }

export interface FirebaseTurnSession<State> {
  readonly transport: 'firebase-turn'
  readonly gameId: OnlineGameId
  readonly sessionId: string
  readonly role: 'host' | 'guest'
  readonly pairingControls?: { report: () => Promise<void>; block: () => Promise<void> }
  subscribe(state: (next: State) => void, connected: (value: boolean) => void): () => void
  submit(next: State): Promise<void>
  restart(): Promise<void>
  close(): void
}

/** 開局資料只能由甲建立；其後所有局面都依各棋類規則核心驗證一個合法回合。 */
export async function createFirebaseTurnSession<State>(
  database: Database,
  pairing: FirebasePairingSession,
  gameId: OnlineGameId,
  hostUid: string,
  guestUid: string,
  signal: AbortSignal,
  rules: OnlineTurnRules<State>,
  expiresAt = Date.now() + 2 * 60 * 60 * 1000,
): Promise<FirebaseTurnSession<State>> {
  if (pairing.gameId !== gameId) throw new Error('房間與遊戲棋種不一致。')
  const base = `pairing/matches/${pairing.matchId}`
  const boardRef = ref(database, `${base}/board`)
  const presenceRef = ref(database, `${base}/presence/${pairing.uid}`)
  const peerUid = pairing.role === 'host' ? guestUid : hostUid
  const initial = rules.serialize(rules.initial())
  let closed = false
  let connected = false
  let peerPresent = false
  let revision = -1
  let current = rules.initial()
  const stateListeners = new Set<(state: State) => void>()
  const connectionListeners = new Set<(connected: boolean) => void>()
  const subscriptions: (() => void)[] = []
  let expiryTimer = 0
  const notifyConnection = () => connectionListeners.forEach((listener) => listener(connected && peerPresent && !closed))
  const close = () => {
    if (closed) return
    closed = true
    window.clearTimeout(expiryTimer)
    signal.removeEventListener('abort', close)
    subscriptions.forEach((unsubscribe) => unsubscribe())
    notifyConnection()
    void pairing.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', close, { once: true })
  expiryTimer = window.setTimeout(close, Math.max(0, expiresAt - Date.now()))
  if (signal.aborted) { close(); throw new Error('配對已取消。') }

  const validNext = (before: State, next: State, role: 'host' | 'guest') =>
    rules.currentRole(before) === role && rules.isLegalStep(before, next)
  const isReset = (record: BoardRecord, next: State) =>
    record.serialized === initial && rules.serialize(next) === initial

  try {
    if (pairing.role === 'host') {
      await runTransaction(boardRef, (value) => value ?? { revision: 0, serialized: initial, initial, nextUid: hostUid }, { applyLocally: false })
    }
    await onDisconnect(presenceRef).set(false)
    if (closed || signal.aborted) throw new Error('配對已取消。')
    await new Promise<void>((resolve, reject) => {
      let ready = false
      const timer = window.setTimeout(() => finish(new Error('等待另一台裝置完成連線逾時。')), 30_000)
      const abort = () => finish(new Error('配對已取消。'))
      const finish = (error?: Error) => {
        if (ready) return
        ready = true
        window.clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve()
      }
      signal.addEventListener('abort', abort, { once: true })
      const check = () => { if (connected && peerPresent && revision >= 0) finish() }
      subscriptions.push(onValue(boardRef, (snapshot) => {
        const record = snapshot.val() as BoardRecord | null
        if (record === null) return
        try {
          if (!Number.isSafeInteger(record.revision) || record.revision < revision) return
          if (record.initial !== initial) throw new Error('初始棋盤不一致。')
          const next = rules.deserialize(record.serialized)
          if (record.revision === revision + 1 && revision >= 0 &&
            !validNext(current, next, 'host') && !validNext(current, next, 'guest') && !isReset(record, next)) {
            throw new Error('對方送出不合法的棋步。')
          }
          if (record.nextUid !== (rules.currentRole(next) === 'host' ? hostUid : guestUid)) throw new Error('回合資料不一致。')
          const firstBoard = revision < 0
          current = next
          revision = record.revision
          if (firstBoard && !closed) void set(presenceRef, true).catch((error: Error) => finish(error))
          stateListeners.forEach((listener) => listener(next))
          check()
        } catch (error) { connected = false; notifyConnection(); finish(error as Error) }
      }, (error) => { connected = false; notifyConnection(); finish(error) }))
      subscriptions.push(onValue(ref(database, `${base}/presence/${peerUid}`), (snapshot) => {
        peerPresent = snapshot.val() === true
        notifyConnection()
        check()
      }, (error) => { peerPresent = false; notifyConnection(); finish(error) }))
      subscriptions.push(onValue(ref(database, '.info/connected'), (snapshot) => {
        connected = snapshot.val() === true
        notifyConnection()
        if (connected) void onDisconnect(presenceRef).set(false).then(() => closed || revision < 0 ? undefined : set(presenceRef, true)).catch((error: Error) => {
          connected = false; notifyConnection(); finish(error)
        })
        check()
      }))
    })
    return {
      transport: 'firebase-turn', gameId, sessionId: pairing.matchId, role: pairing.role,
      pairingControls: { report: pairing.report, block: pairing.block },
      subscribe: (state, connection) => {
        stateListeners.add(state); connectionListeners.add(connection)
        state(current); connection(connected && peerPresent && !closed)
        return () => { stateListeners.delete(state); connectionListeners.delete(connection) }
      },
      submit: async (next) => {
        if (closed || !connected || !peerPresent) throw new Error('連線中斷。')
        if (!validNext(current, next, pairing.role)) throw new Error('不合法的棋步。')
        const expected = revision
        const result = await runTransaction(boardRef, (value: BoardRecord | null) => {
          if (closed || value === null || value.revision !== expected) return
          return { revision: expected + 1, serialized: rules.serialize(next), initial: value.initial, nextUid: rules.currentRole(next) === 'host' ? hostUid : guestUid }
        }, { applyLocally: false })
        if (!result.committed) { await get(boardRef); throw new Error('局面已更新，請重新選擇棋步。') }
      },
      restart: async () => {
        if (pairing.role !== 'host' || closed || !connected || !peerPresent) throw new Error('只有第一位玩家能重新開局。')
        const expected = revision
        const result = await runTransaction(boardRef, (value: BoardRecord | null) => {
          if (closed || value === null || value.revision !== expected) return
          return { revision: expected + 1, serialized: initial, initial, nextUid: hostUid }
        }, { applyLocally: false })
        if (!result.committed) throw new Error('局面已更新，請稍後再試。')
      },
      close,
    }
  } catch (error) { close(); throw error }
}
