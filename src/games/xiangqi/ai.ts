import { applyMove, getLegalMoves, type XiangqiKind, type XiangqiMove, type XiangqiPlayer, type XiangqiState } from './rules'

export type XiangqiDifficulty = 'beginner' | 'growth' | 'challenge' | 'adult'

const VALUE: Readonly<Record<XiangqiKind, number>> = {
  king: 10000, chariot: 520, cannon: 270, horse: 250, soldier: 90, advisor: 40, elephant: 40,
}

function indexFromSeed(seed: number, count: number): number {
  let value = seed >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return (value >>> 0) % count
}

function evaluate(state: XiangqiState, player: XiangqiPlayer): number {
  if (state.phase === 'won') return state.winner === player ? 1_000_000 : -1_000_000
  if (state.phase === 'draw') return 0
  let score = 0
  for (const piece of state.board) {
    if (!piece) continue
    let value = VALUE[piece.kind]
    if (piece.kind === 'soldier') {
      const progress = piece.owner === 'red' ? 9 - piece.row : piece.row
      value += progress * 9
    }
    score += piece.owner === player ? value : -value
  }
  if (state.phase === 'check') score += state.currentPlayer === player ? -45 : 45
  return score
}

function rankedMoves(state: XiangqiState, player: XiangqiPlayer) {
  return getLegalMoves(state).map(move => ({ move, next: applyMove(state, move.from, move.to) }))
    .sort((first, second) => evaluate(second.next, player) - evaluate(first.next, player) || first.move.from - second.move.from || first.move.to - second.move.to)
}

/** 四階 NPC 都只從公開局面的合法步選擇；種子讓相同局面可重播。 */
export function chooseXiangqiMove(
  state: XiangqiState,
  difficulty: XiangqiDifficulty,
  seed = state.turns.length * 113 + 20260925,
): XiangqiMove | null {
  if (state.phase === 'won' || state.phase === 'draw') return null
  const legal = getLegalMoves(state)
  if (legal.length === 0) return null
  if (difficulty === 'beginner') return legal[indexFromSeed(seed, legal.length)]!
  const player = state.currentPlayer
  const ranked = rankedMoves(state, player)
  if (difficulty === 'growth') {
    const candidates = ranked.slice(0, Math.min(6, ranked.length))
    return candidates[indexFromSeed(seed, candidates.length)]!.move
  }
  if (difficulty === 'challenge') {
    const candidates = ranked.slice(0, Math.min(3, ranked.length))
    return candidates[indexFromSeed(seed, candidates.length)]!.move
  }
  const candidates = ranked.slice(0, Math.min(12, ranked.length))
  let best = candidates[0]!
  let bestScore = -Infinity
  for (const candidate of candidates) {
    const replyScores = candidate.next.phase === 'won' || candidate.next.phase === 'draw'
      ? [] : rankedMoves(candidate.next, candidate.next.currentPlayer).slice(0, 8).map(reply => evaluate(reply.next, player))
    const score = replyScores.length ? Math.min(...replyScores) : evaluate(candidate.next, player)
    if (score > bestScore) { bestScore = score; best = candidate }
  }
  return best.move
}
