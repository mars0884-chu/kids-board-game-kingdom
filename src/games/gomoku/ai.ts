import type { DifficultyLevel } from '../../components/common-ui'
import {
  GOMOKU_BOARD_SIZE,
  isLegalGomokuMove,
  playGomokuMove,
  type GomokuCell,
  type GomokuMove,
  type GomokuPlayer,
  type GomokuState,
} from './rules'

type Direction = readonly [number, number]

interface RankedMove {
  readonly move: GomokuMove
  readonly score: number
}

const DIRECTIONS: readonly Direction[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

const WIN_SCORE = 10_000_000
const CANDIDATE_RADIUS = 2

function opposite(player: GomokuPlayer): GomokuPlayer {
  return player === 'black' ? 'white' : 'black'
}

function seededIndex(length: number, seed: number): number {
  if (length === 0) return 0
  const value = Math.abs(Math.floor(Math.sin(seed * 12.9898) * 43758.5453))
  return value % length
}

function tieBreak(move: GomokuMove, seed: number): number {
  return Math.abs(Math.sin((move + 17) * (seed + 31) * 0.61803398875))
}

function toMove(row: number, column: number): GomokuMove {
  return row * GOMOKU_BOARD_SIZE + column
}

function inBounds(row: number, column: number): boolean {
  return row >= 0 && row < GOMOKU_BOARD_SIZE && column >= 0 && column < GOMOKU_BOARD_SIZE
}

function centerDistance(move: GomokuMove): number {
  const row = Math.floor(move / GOMOKU_BOARD_SIZE)
  const column = move % GOMOKU_BOARD_SIZE
  const center = Math.floor(GOMOKU_BOARD_SIZE / 2)
  return Math.abs(row - center) + Math.abs(column - center)
}

function candidateMoves(state: GomokuState): readonly GomokuMove[] {
  if (state.phase !== 'playing') return []

  const occupiedMoves = state.board.flatMap((cell, move) => cell === null ? [] : [move])
  // 黑方少於四顆既有棋子時，不可能形成雙三、雙四或長連線；省略昂貴但結果必為合法的禁手檢查。
  const needsBlackForbiddenCheck = state.currentPlayer === 'black' &&
    state.board.filter((cell) => cell === 'black').length >= 4
  if (occupiedMoves.length === 0) {
    const center = toMove(Math.floor(GOMOKU_BOARD_SIZE / 2), Math.floor(GOMOKU_BOARD_SIZE / 2))
    return isLegalGomokuMove(state, center) ? [center] : []
  }

  const nearby = new Set<GomokuMove>()
  for (const occupied of occupiedMoves) {
    const row = Math.floor(occupied / GOMOKU_BOARD_SIZE)
    const column = occupied % GOMOKU_BOARD_SIZE
    for (let rowOffset = -CANDIDATE_RADIUS; rowOffset <= CANDIDATE_RADIUS; rowOffset += 1) {
      for (let columnOffset = -CANDIDATE_RADIUS; columnOffset <= CANDIDATE_RADIUS; columnOffset += 1) {
        const nextRow = row + rowOffset
        const nextColumn = column + columnOffset
        if (inBounds(nextRow, nextColumn)) {
          nearby.add(toMove(nextRow, nextColumn))
        }
      }
    }
  }

  const localMoves = [...nearby]
    .sort((left, right) => left - right)
    .filter((move) => state.board[move] === null && (!needsBlackForbiddenCheck || isLegalGomokuMove(state, move)))
  if (localMoves.length > 0) return localMoves

  return state.board.flatMap((cell, move) =>
    cell === null && (!needsBlackForbiddenCheck || isLegalGomokuMove(state, move)) ? [move] : [],
  )
}

function chooseImmediateMove(state: GomokuState, player: GomokuPlayer, moves: readonly GomokuMove[]): GomokuMove | null {
  for (const move of moves) {
    const next = playGomokuMove({ ...state, currentPlayer: player }, move)
    if (next.phase === 'won' && next.winner === player) return move
  }
  return null
}

function collectRun(
  board: readonly GomokuCell[],
  move: GomokuMove,
  player: GomokuPlayer,
  direction: Direction,
): readonly [length: number, openEnds: number] {
  const row = Math.floor(move / GOMOKU_BOARD_SIZE)
  const column = move % GOMOKU_BOARD_SIZE
  const [rowStep, columnStep] = direction
  let length = 1
  let openEnds = 0

  for (const sign of [-1, 1]) {
    let nextRow = row + rowStep * sign
    let nextColumn = column + columnStep * sign
    while (inBounds(nextRow, nextColumn) && board[toMove(nextRow, nextColumn)] === player) {
      length += 1
      nextRow += rowStep * sign
      nextColumn += columnStep * sign
    }
    if (inBounds(nextRow, nextColumn) && board[toMove(nextRow, nextColumn)] === null) {
      openEnds += 1
    }
  }

  return [length, openEnds]
}

function runScore(length: number, openEnds: number): number {
  if (length >= 5) return WIN_SCORE
  if (length === 4) return openEnds === 2 ? 120_000 : openEnds === 1 ? 32_000 : 0
  if (length === 3) return openEnds === 2 ? 8_000 : openEnds === 1 ? 1_500 : 0
  if (length === 2) return openEnds === 2 ? 700 : openEnds === 1 ? 160 : 0
  return openEnds === 2 ? 30 : 0
}

function localPatternScore(
  board: readonly GomokuCell[],
  move: GomokuMove,
  player: GomokuPlayer,
  direction: Direction,
): number {
  const row = Math.floor(move / GOMOKU_BOARD_SIZE)
  const column = move % GOMOKU_BOARD_SIZE
  const [rowStep, columnStep] = direction
  const pattern = Array.from({ length: 9 }, (_, index) => {
    const offset = index - 4
    const nextRow = row + rowStep * offset
    const nextColumn = column + columnStep * offset
    if (!inBounds(nextRow, nextColumn)) return '#'
    const cell = board[toMove(nextRow, nextColumn)]
    return cell === player ? 'X' : cell === null ? '.' : 'O'
  }).join('')

  let score = 0
  if (pattern.includes('.XXXX.')) score += 95_000
  if (pattern.includes('.XXX.X.') || pattern.includes('.XX.XX.')) score += 42_000
  if (pattern.includes('.XXX.')) score += 4_000
  if (pattern.includes('.XX.X.') || pattern.includes('.X.XX.')) score += 3_500
  if (pattern.includes('.XX.')) score += 250
  return score
}

function placementScore(board: readonly GomokuCell[], move: GomokuMove, player: GomokuPlayer): number {
  let score = 0
  for (const direction of DIRECTIONS) {
    const [length, openEnds] = collectRun(board, move, player, direction)
    score += runScore(length, openEnds)
    score += localPatternScore(board, move, player, direction)
  }
  return score + Math.max(0, 14 - centerDistance(move)) * 8
}

function scoreMove(state: GomokuState, move: GomokuMove): RankedMove {
  const next = playGomokuMove(state, move)
  return {
    move,
    score: next.phase === 'won' && next.winner === state.currentPlayer
      ? WIN_SCORE
      : placementScore(next.board, move, state.currentPlayer),
  }
}

function rankMoves(state: GomokuState, limit: number): readonly RankedMove[] {
  return candidateMoves(state)
    .map((move) => scoreMove(state, move))
    .sort((left, right) => right.score - left.score || left.move - right.move)
    .slice(0, limit)
}

function strategicMoves(state: GomokuState, attackLimit: number, defenseLimit: number): readonly RankedMove[] {
  const legalMoves = new Set(candidateMoves(state))
  const moveScores = new Map<GomokuMove, number>()

  for (const entry of rankMoves(state, attackLimit)) {
    moveScores.set(entry.move, entry.score)
  }

  const opponentState = { ...state, currentPlayer: opposite(state.currentPlayer) }
  for (const entry of rankMoves(opponentState, defenseLimit)) {
    if (legalMoves.has(entry.move) && !moveScores.has(entry.move)) {
      moveScores.set(entry.move, scoreMove(state, entry.move).score)
    }
  }

  return [...moveScores].map(([move, score]) => ({ move, score }))
    .sort((left, right) => right.score - left.score || left.move - right.move)
}

function chooseBest(rankedMoves: readonly RankedMove[], seed: number): GomokuMove | null {
  if (rankedMoves.length === 0) return null
  const bestScore = rankedMoves[0].score
  const tiedBest = rankedMoves.filter((entry) => entry.score === bestScore)
  return [...tiedBest]
    .sort((left, right) => tieBreak(left.move, seed) - tieBreak(right.move, seed))[0]
    ?.move ?? null
}

function chooseGrowthMove(state: GomokuState, seed: number): GomokuMove | null {
  const rankedMoves = rankMoves(state, 18)
  if (rankedMoves.length === 0) return null
  const bestScore = rankedMoves[0].score
  const gentleChoices = rankedMoves
    .filter((entry) => entry.score >= Math.max(bestScore * 0.84, bestScore - 2_500))
    .slice(0, 3)
  return gentleChoices[seededIndex(gentleChoices.length, seed)]?.move ?? null
}

function challengeScore(state: GomokuState, move: RankedMove): number {
  const afterMove = playGomokuMove(state, move.move)
  if (afterMove.phase === 'won') return WIN_SCORE

  const opponentBest = rankMoves(afterMove, 12)[0]
  if (opponentBest === undefined) return move.score
  if (opponentBest.score >= WIN_SCORE) return -WIN_SCORE
  return move.score - opponentBest.score * 1.08
}

function chooseChallengeMove(state: GomokuState, seed: number): GomokuMove | null {
  const scoredMoves = strategicMoves(state, 12, 6)
    .map((entry) => ({ ...entry, score: challengeScore(state, entry) }))
    .sort((left, right) => right.score - left.score || left.move - right.move)
  return chooseBest(scoredMoves, seed)
}

function adultScore(state: GomokuState, move: RankedMove): number {
  const afterMove = playGomokuMove(state, move.move)
  if (afterMove.phase === 'won') return WIN_SCORE

  // 成人版維持三層攻防預判，但只保留最有威脅的兩種回應，
  // 避免在觸控裝置上以大量等價分支換取不易察覺的棋力差異。
  const opponentReplies = rankMoves(afterMove, 2)
  if (opponentReplies.length === 0) return move.score

  let worstCase = Number.POSITIVE_INFINITY
  for (const opponentReply of opponentReplies) {
    if (opponentReply.score >= WIN_SCORE) return -WIN_SCORE
    const afterOpponentReply = playGomokuMove(afterMove, opponentReply.move)
    if (afterOpponentReply.phase === 'won') return -WIN_SCORE
    const bestResponse = rankMoves(afterOpponentReply, 1)[0]?.score ?? 0
    const branchScore = move.score * 1.12 - opponentReply.score * 1.34 + bestResponse * 0.52
    worstCase = Math.min(worstCase, branchScore)
  }
  return worstCase
}

function chooseAdultMove(state: GomokuState, seed: number): GomokuMove | null {
  const scoredMoves = strategicMoves(state, 4, 3)
    .map((entry) => ({ ...entry, score: adultScore(state, entry) }))
    .sort((left, right) => right.score - left.score || left.move - right.move)
  return chooseBest(scoredMoves, seed)
}

function chooseRequiredBlock(state: GomokuState, player: GomokuPlayer, moves: readonly GomokuMove[]): GomokuMove | null {
  const opponent = opposite(player)
  const opponentState = { ...state, currentPlayer: opponent }
  const opponentWinningMove = chooseImmediateMove(opponentState, opponent, candidateMoves(opponentState))
  return opponentWinningMove !== null && moves.includes(opponentWinningMove) ? opponentWinningMove : null
}

function chooseDevelopingThreatBlock(state: GomokuState, player: GomokuPlayer, moves: readonly GomokuMove[]): GomokuMove | null {
  const opponentState = { ...state, currentPlayer: opposite(player) }
  const developingThreat = rankMoves(opponentState, 4)
    .find((entry) => entry.score >= 100_000 && moves.includes(entry.move))
  return developingThreat?.move ?? null
}

export function chooseGomokuMove(state: GomokuState, difficulty: DifficultyLevel, seed: number): GomokuMove | null {
  const moves = candidateMoves(state)
  if (moves.length === 0) return null

  if (difficulty === 'beginner') {
    const gentleMoves = candidateMoves(state)
    return gentleMoves[seededIndex(gentleMoves.length, seed)] ?? null
  }

  const player = state.currentPlayer
  const winningMove = chooseImmediateMove(state, player, moves)
  if (winningMove !== null) return winningMove

  const requiredBlock = chooseRequiredBlock(state, player, moves)
  if (requiredBlock !== null) return requiredBlock

  if (difficulty === 'growth') return chooseGrowthMove(state, seed)
  const developingThreatBlock = chooseDevelopingThreatBlock(state, player, moves)
  if (developingThreatBlock !== null) return developingThreatBlock
  if (difficulty === 'challenge') return chooseChallengeMove(state, seed)
  return chooseAdultMove(state, seed)
}
