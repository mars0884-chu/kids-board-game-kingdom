import { createNumberGemPuzzle } from '../games/number-gem-connection/generator'
import { evaluateNumberGemPath } from '../games/number-gem-connection/rules'

export type NumberGemRaceRole = 'host' | 'guest'
export type NumberGemRacePhase = 'ready' | 'playing' | 'result' | 'complete'

export interface NumberGemRaceState {
  readonly version: 1
  readonly phase: NumberGemRacePhase
  readonly seed: number
  readonly decidedRounds: number
  readonly scores: Readonly<Record<NumberGemRaceRole, number>>
  readonly ready: Readonly<Record<NumberGemRaceRole, boolean>>
  readonly startsAt: number | null
  readonly deadlineAt: number | null
  readonly roundWinner: NumberGemRaceRole | null
  readonly matchWinner: NumberGemRaceRole | null
}

export const NUMBER_GEM_RACE_SECONDS = 90
export const NUMBER_GEM_RACE_START_DELAY_MS = 3000
const FIRST_SEED = 20260825

export function createNumberGemRaceState(): NumberGemRaceState {
  return {
    version: 1,
    phase: 'ready',
    seed: FIRST_SEED,
    decidedRounds: 0,
    scores: { host: 0, guest: 0 },
    ready: { host: false, guest: false },
    startsAt: null,
    deadlineAt: null,
    roundWinner: null,
    matchWinner: null,
  }
}

/** 可信服務時間才可觸發逾時；未答對的題目不計入五個勝負回合。 */
export function expireNumberGemRace(state: NumberGemRaceState, serverNow: number): NumberGemRaceState {
  if (state.phase !== 'playing' || state.deadlineAt === null || serverNow < state.deadlineAt) return state
  return {
    ...state,
    phase: 'ready',
    seed: state.seed + 1,
    ready: { host: false, guest: false },
    startsAt: null,
    deadlineAt: null,
    roundWinner: null,
  }
}

export function readyNumberGemRace(state: NumberGemRaceState, role: NumberGemRaceRole, serverNow: number): NumberGemRaceState {
  const current = expireNumberGemRace(state, serverNow)
  if (current.phase === 'complete' || current.phase === 'playing' || current.ready[role]) throw new Error('目前無法準備下一題。')
  const upcoming = current.phase === 'result' ? { ...current, phase: 'ready' as const, seed: current.seed + 1 } : current
  const ready = { ...upcoming.ready, [role]: true }
  if (!ready.host || !ready.guest) return { ...upcoming, phase: 'ready', ready }
  const startsAt = serverNow + NUMBER_GEM_RACE_START_DELAY_MS
  return {
    ...upcoming,
    phase: 'playing',
    ready,
    startsAt,
    deadlineAt: startsAt + NUMBER_GEM_RACE_SECONDS * 1000,
    roundWinner: null,
  }
}

/** 每次只接受一條完整正解；同時抵達時由房間序列化的第一筆有效提交取得該局。 */
export function solveNumberGemRace(state: NumberGemRaceState, role: NumberGemRaceRole, path: readonly number[], serverNow: number): NumberGemRaceState {
  const current = expireNumberGemRace(state, serverNow)
  if (current.phase !== 'playing' || current.startsAt === null || current.deadlineAt === null ||
    serverNow < current.startsAt || serverNow >= current.deadlineAt) throw new Error('此題尚未開始或已結束。')
  if (evaluateNumberGemPath(createNumberGemPuzzle(current.seed, 'beginner'), path).status !== 'completed') throw new Error('答案尚未完成。')
  const scores = { ...current.scores, [role]: current.scores[role] + 1 }
  const decidedRounds = current.decidedRounds + 1
  const matchWinner = scores[role] >= 3 ? role : null
  return {
    ...current,
    phase: matchWinner === null ? 'result' : 'complete',
    decidedRounds,
    scores,
    ready: { host: false, guest: false },
    startsAt: null,
    deadlineAt: null,
    roundWinner: role,
    matchWinner,
  }
}
