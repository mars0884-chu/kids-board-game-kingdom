import { createNumberGemPuzzle } from '../games/number-gem-connection/generator'
import { chooseNumberGemCell, createNumberGemState, deserializeNumberGemState, serializeNumberGemState, undoNumberGemCell, type NumberGemState } from '../games/number-gem-connection/rules'
import { createInitialNumberGemScore, isNumberGemLocalMatchComplete, normalizeNumberGemScore, recordNumberGemCompletion, type NumberGemScore } from '../games/number-gem-connection/score'
import type { OnlineTurnRules } from './turn-rules'

export interface NumberGemOnlineMatch {
  state: NumberGemState
  score: NumberGemScore
  roundSeed: number
  player: 1 | 2
}

export function createNumberGemOnlineMatch(): NumberGemOnlineMatch {
  const roundSeed = 20260825
  return { state: createNumberGemState(createNumberGemPuzzle(roundSeed, 'beginner')), score: createInitialNumberGemScore(), roundSeed, player: 1 }
}

export function chooseOnlineNumberGemCell(match: NumberGemOnlineMatch, index: number): NumberGemOnlineMatch {
  const next = chooseNumberGemCell(match.state, index).state
  if (next === match.state) return match
  return { ...match, state: next, score: next.phase === 'completed' ? recordNumberGemCompletion(match.score, 'local', match.player) : match.score }
}

export function undoOnlineNumberGemCell(match: NumberGemOnlineMatch): NumberGemOnlineMatch {
  if (match.state.phase !== 'playing' || match.state.path.length === 0) return match
  return { ...match, state: undoNumberGemCell(match.state) }
}

export function advanceOnlineNumberGemRound(match: NumberGemOnlineMatch): NumberGemOnlineMatch {
  if (match.state.phase !== 'completed' || isNumberGemLocalMatchComplete(match.score)) return match
  const player = match.player === 1 && match.score.localQuestions[1] >= 3 ? 2 : match.player
  const roundSeed = match.roundSeed + 1
  return { ...match, player, roundSeed, state: createNumberGemState(createNumberGemPuzzle(roundSeed, 'beginner')) }
}

function serialize(match: NumberGemOnlineMatch): string {
  return JSON.stringify({ state: serializeNumberGemState(match.state), score: match.score, roundSeed: match.roundSeed, player: match.player })
}

function deserialize(serialized: string): NumberGemOnlineMatch {
  const value: unknown = JSON.parse(serialized)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('數字寶石連線局面無效。')
  const record = value as Record<string, unknown>
  if (typeof record.state !== 'string' || !Number.isSafeInteger(record.roundSeed) || typeof record.roundSeed !== 'number' || record.roundSeed < 20260825 || (record.player !== 1 && record.player !== 2)) throw new Error('數字寶石連線局面無效。')
  const score = normalizeNumberGemScore(record.score)
  if (score === null) throw new Error('數字寶石計分資料無效。')
  const state = deserializeNumberGemState(record.state)
  if (JSON.stringify(state.puzzle) !== JSON.stringify(createNumberGemPuzzle(record.roundSeed, 'beginner'))) throw new Error('數字寶石題目與回合不一致。')
  return { state, score, roundSeed: record.roundSeed, player: record.player }
}

export const numberGemOnlineRules: OnlineTurnRules<NumberGemOnlineMatch> = {
  initial: createNumberGemOnlineMatch,
  serialize,
  deserialize,
  currentRole: (match) => match.player === 1 ? 'host' : 'guest',
  isLegalStep: (before, next) => {
    const target = serialize(next)
    if (target === serialize(before)) return false
    if (before.state.phase === 'completed') return serialize(advanceOnlineNumberGemRound(before)) === target
    if (serialize(undoOnlineNumberGemCell(before)) === target) return true
    return before.state.puzzle.board.some((_, index) => serialize(chooseOnlineNumberGemCell(before, index)) === target)
  },
}
