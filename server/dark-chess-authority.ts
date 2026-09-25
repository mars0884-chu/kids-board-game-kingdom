import { applyDarkChessAction, createDarkChessState, getPublicDarkChessState, type DarkChessAction, type DarkChessPublicState, type DarkChessState } from '../src/games/dark-chess/rules'

/** 只存於可信服務；不可將 secretState、seed 或棋子 ID 傳到瀏覽器。 */
export interface DarkChessRoomRecord {
  readonly revision: number
  readonly secretState: DarkChessState
}

export interface DarkChessRoomView {
  readonly revision: number
  readonly state: DarkChessPublicState
}

export function createDarkChessRoom(seed: number): DarkChessRoomRecord {
  return { revision: 0, secretState: createDarkChessState(seed) }
}

export function publicDarkChessRoom(record: DarkChessRoomRecord): DarkChessRoomView {
  return { revision: record.revision, state: getPublicDarkChessState(record.secretState) }
}

export function applyDarkChessRoomAction(record: DarkChessRoomRecord, role: 'host' | 'guest', expectedRevision: number, action: DarkChessAction): DarkChessRoomRecord {
  if (record.revision !== expectedRevision) throw new Error('局面已更新，請重新選擇棋步。')
  if ((record.secretState.currentPlayer === 'player1' ? 'host' : 'guest') !== role) throw new Error('還沒有輪到你。')
  return { revision: record.revision + 1, secretState: applyDarkChessAction(record.secretState, action) }
}

export function restartDarkChessRoom(record: DarkChessRoomRecord, role: 'host' | 'guest', seed: number): DarkChessRoomRecord {
  if (role !== 'host') throw new Error('只有第一位玩家能重新開局。')
  return { revision: record.revision + 1, secretState: createDarkChessState(seed) }
}
