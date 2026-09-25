import { animalChessOnlineRules, gomokuOnlineRules, reversiOnlineRules, ticTacToeOnlineRules, type OnlineTurnRules } from '../src/online/turn-rules'
import { numberGemOnlineRules } from '../src/online/number-gem-turn-rules'

export type TrustedTurnGameId = 'animal-chess' | 'gomoku' | 'number-gem' | 'reversi' | 'tic-tac-toe'

interface TurnAdapter {
  initial(): string
  nextRole(serialized: string): 'host' | 'guest'
  isLegalStep(before: string, next: string, role: 'host' | 'guest'): boolean
}

function adapter<State>(rules: OnlineTurnRules<State>): TurnAdapter {
  return {
    initial: () => rules.serialize(rules.initial()),
    nextRole: (serialized) => rules.currentRole(rules.deserialize(serialized)),
    isLegalStep: (before, next, role) => {
      const previous = rules.deserialize(before)
      const candidate = rules.deserialize(next)
      return rules.currentRole(previous) === role && rules.serialize(candidate) === next && rules.isLegalStep(previous, candidate)
    },
  }
}

const adapters: Record<TrustedTurnGameId, TurnAdapter> = {
  'animal-chess': adapter(animalChessOnlineRules),
  gomoku: adapter(gomokuOnlineRules),
  'number-gem': adapter(numberGemOnlineRules),
  reversi: adapter(reversiOnlineRules),
  'tic-tac-toe': adapter(ticTacToeOnlineRules),
}

export function isTrustedTurnGameId(value: unknown): value is TrustedTurnGameId {
  return typeof value === 'string' && Object.hasOwn(adapters, value)
}

export interface TurnRoomRecord {
  readonly gameId: TrustedTurnGameId
  readonly revision: number
  readonly serialized: string
}

export function createTurnRoom(gameId: TrustedTurnGameId): TurnRoomRecord {
  return { gameId, revision: 0, serialized: adapters[gameId].initial() }
}

export function applyTurnRoomStep(record: TurnRoomRecord, role: 'host' | 'guest', expectedRevision: number, serialized: string): TurnRoomRecord {
  if (record.revision !== expectedRevision) throw new Error('局面已更新，請重新選擇棋步。')
  if (serialized.length > 131072) throw new Error('棋局資料過長。')
  if (!adapters[record.gameId].isLegalStep(record.serialized, serialized, role)) throw new Error('不合法的棋步。')
  return { ...record, revision: record.revision + 1, serialized }
}

export function restartTurnRoom(record: TurnRoomRecord, role: 'host' | 'guest', expectedRevision: number): TurnRoomRecord {
  if (role !== 'host') throw new Error('只有第一位玩家能重新開局。')
  if (record.revision !== expectedRevision) throw new Error('局面已更新，請稍後再試。')
  return { ...record, revision: record.revision + 1, serialized: adapters[record.gameId].initial() }
}

export function nextTurnRole(record: TurnRoomRecord): 'host' | 'guest' {
  return adapters[record.gameId].nextRole(record.serialized)
}
