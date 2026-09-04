import {
  applyJumpChessMove,
  finishJumpChessTurn,
  getJumpCampOwner,
  getJumpTargetCampOwner,
  getLegalJumpMoves,
  getJumpHole,
  type JumpChessState,
  type JumpMove,
} from './rules'

export type JumpChessDifficulty = 'beginner' | 'growth' | 'challenge' | 'adult'

function seededIndex(seed: number, length: number): number {
  let value = seed >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return (value >>> 0) % length
}

function chooseSeeded<T>(values: readonly T[], seed: number): T {
  return values[seededIndex(seed, values.length)] as T
}

function progressScore(state: JumpChessState, move: JumpMove): number {
  const targetOwner = getJumpTargetCampOwner(state.currentPlayer)
  const targetBefore = getJumpCampOwner(move.from) === targetOwner ? 40 : 0
  const targetAfter = getJumpCampOwner(move.to) === targetOwner ? 120 : 0
  const from = getJumpHole(move.from)
  const to = getJumpHole(move.to)
  if (from === null || to === null) return targetAfter - targetBefore
  const beforeDistance = Math.abs(from.z - (state.currentPlayer === 'player1' ? -5 : 5))
  const afterDistance = Math.abs(to.z - (state.currentPlayer === 'player1' ? -5 : 5))
  return targetAfter - targetBefore + (beforeDistance - afterDistance) * 10 + (move.kind === 'jump' ? 2 : 0)
}

function rankMoves(state: JumpChessState, moves: readonly JumpMove[]): JumpMove[] {
  return [...moves].sort((first, second) => progressScore(state, second) - progressScore(state, first))
}

function chooseFirstMove(state: JumpChessState, difficulty: JumpChessDifficulty, seed: number): JumpMove | null {
  const legalMoves = [...getLegalJumpMoves(state)]
  if (legalMoves.length === 0) return null
  if (difficulty === 'beginner') return chooseSeeded(legalMoves, seed)

  const ranked = rankMoves(state, legalMoves)
  if (difficulty === 'growth') return chooseSeeded(ranked.slice(0, Math.min(4, ranked.length)), seed)
  if (difficulty === 'challenge') return chooseSeeded(ranked.slice(0, Math.min(2, ranked.length)), seed)
  return ranked[0]!
}

function shouldContinueJump(difficulty: JumpChessDifficulty, seed: number, hasProgress: boolean): boolean {
  if (!hasProgress) return false
  const threshold = difficulty === 'beginner' ? 45 : difficulty === 'growth' ? 72 : difficulty === 'challenge' ? 88 : 96
  return seededIndex(seed, 100) < threshold
}

/**
 * 選出 NPC 的完整回合。跳躍會先產生每一段，再由畫面一次依序播放，
 * 讓規則核心仍是唯一的合法走法來源。
 */
export function chooseJumpChessTurn(
  state: JumpChessState,
  difficulty: JumpChessDifficulty,
  seed = state.seed + state.turnCount * 97,
): readonly JumpMove[] {
  if (state.phase !== 'playing' || state.activeJump !== null) return []
  const first = chooseFirstMove(state, difficulty, seed)
  if (first === null) return []

  const moves: JumpMove[] = [first]
  if (first.kind === 'step') return moves

  let preview = applyJumpChessMove(state, first)
  let jumpSeed = seed + 17
  while (preview.phase === 'playing' && preview.activeJump !== null) {
    const continuations = rankMoves(preview, getLegalJumpMoves(preview))
    if (continuations.length === 0 || !shouldContinueJump(difficulty, jumpSeed, moves.length > 0)) break
    const next = difficulty === 'adult' ? continuations[0]! : chooseSeeded(continuations.slice(0, difficulty === 'challenge' ? 2 : 4), jumpSeed)
    moves.push(next)
    preview = applyJumpChessMove(preview, next)
    jumpSeed += 31
  }
  return moves
}

export function applyJumpChessNpcTurn(state: JumpChessState, difficulty: JumpChessDifficulty, seed = state.seed): JumpChessState {
  const plan = chooseJumpChessTurn(state, difficulty, seed)
  let next = state
  for (const move of plan) {
    if (next.phase !== 'playing') break
    next = applyJumpChessMove(next, move)
  }
  if (next.phase === 'playing' && next.activeJump !== null) next = finishJumpChessTurn(next)
  return next
}

