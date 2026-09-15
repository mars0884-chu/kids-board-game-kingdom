import { get, onDisconnect, onValue, ref, runTransaction, set, type Database } from 'firebase/database'
import { createJumpChessState, deserializeJumpChessState, serializeJumpChessState, getLegalJumpMoves, applyJumpChessMove, finishJumpChessTurn, type JumpChessState } from '../games/jump-chess/rules'
import type { FirebasePairingSession } from './firebase-pairing'

export interface FirebaseGameSession {
  readonly transport: 'firebase'
  readonly sessionId: string
  readonly role: 'host' | 'guest'
  readonly pairingControls: { report: () => Promise<void>; block: () => Promise<void> }
  subscribe(state: (next: JumpChessState) => void, connected: (value: boolean) => void): () => void
  submit(next: JumpChessState): Promise<void>
  close(): void
}

interface BoardRecord { revision: number; serialized: string; initial: string; nextUid: string }

/** 不接受任意覆寫：下一局面必須是一步合法走棋、結束連跳，或甲重新開局。 */
export function isLegalOnlineTransition(before: JumpChessState, next: JumpChessState, role: 'host' | 'guest'): boolean {
  const serialized = serializeJumpChessState(next)
  if (role === 'host' && serialized === serializeJumpChessState(createJumpChessState())) return true
  if (before.phase !== 'playing' || before.currentPlayer !== (role === 'host' ? 'player1' : 'player2')) return false
  if (getLegalJumpMoves(before).some((move) => serializeJumpChessState(applyJumpChessMove(before, move)) === serialized)) return true
  return before.activeJump !== null && serializeJumpChessState(finishJumpChessTurn(before)) === serialized
}

export async function createFirebaseGameSession(database: Database, pairing: FirebasePairingSession, hostUid: string, guestUid: string, signal: AbortSignal, expiresAt = Date.now() + 2 * 60 * 60 * 1000): Promise<FirebaseGameSession> {
  const base = `pairing/matches/${pairing.matchId}`
  const boardRef = ref(database, `${base}/board`)
  const presenceRef = ref(database, `${base}/presence/${pairing.uid}`)
  const peerUid = pairing.role === 'host' ? guestUid : hostUid
  let closed = false
  let connected = false
  let peerPresent = false
  let revision = -1
  let current = createJumpChessState()
  const stateListeners = new Set<(state: JumpChessState) => void>()
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
  try {
    if (pairing.role === 'host') {
      await runTransaction(boardRef, (value) => value ?? { revision: 0, serialized: serializeJumpChessState(current), initial: serializeJumpChessState(current), nextUid: hostUid }, { applyLocally: false })
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
          const next = deserializeJumpChessState(record.serialized)
          if (record.initial !== serializeJumpChessState(createJumpChessState()) || next.seed !== createJumpChessState().seed || JSON.stringify(next.initialPieces) !== JSON.stringify(createJumpChessState().initialPieces)) throw new Error('初始棋盤不一致。')
          if (record.revision === revision + 1 && revision >= 0 && !isLegalOnlineTransition(current, next, 'host') && !isLegalOnlineTransition(current, next, 'guest')) throw new Error('對方送出不合法的棋步。')
          if (record.nextUid !== (next.currentPlayer === 'player1' ? hostUid : guestUid)) throw new Error('回合資料不一致。')
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
        if (connected) {
          void onDisconnect(presenceRef).set(false).then(() => closed || revision < 0 ? undefined : set(presenceRef, true)).catch((error: Error) => {
            connected = false; notifyConnection(); finish(error)
          })
        }
        check()
      }))
    })
    return {
      transport: 'firebase', sessionId: pairing.matchId, role: pairing.role,
      pairingControls: { report: pairing.report, block: pairing.block },
      subscribe: (state, connection) => {
        stateListeners.add(state); connectionListeners.add(connection)
        state(current); connection(connected && peerPresent && !closed)
        return () => { stateListeners.delete(state); connectionListeners.delete(connection) }
      },
      submit: async (next) => {
        if (closed || !connected || !peerPresent) throw new Error('連線中斷。')
        if (!isLegalOnlineTransition(current, next, pairing.role)) throw new Error('不合法的棋步。')
        const expected = revision
        const result = await runTransaction(boardRef, (value: BoardRecord | null) => {
          if (closed || value === null || value.revision !== expected) return
          return { revision: expected + 1, serialized: serializeJumpChessState(next), initial: value.initial, nextUid: next.currentPlayer === 'player1' ? hostUid : guestUid }
        }, { applyLocally: false })
        if (!result.committed) {
          await get(boardRef)
          throw new Error('局面已更新，請重新選擇棋步。')
        }
      },
      close,
    }
  } catch (error) { close(); throw error }
}
