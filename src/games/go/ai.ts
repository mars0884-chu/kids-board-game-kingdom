import type { DifficultyLevel } from '../../components/common-ui'
import { getGoGroup, getLegalGoMoves, playGoMove, type GoPlayer, type GoState } from './rules'

function adjacent(size: number, point: number): number[] {
  const row = Math.floor(point / size)
  const column = point % size
  return [[row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]]
    .filter(([nextRow, nextColumn]) => nextRow! >= 0 && nextRow! < size && nextColumn! >= 0 && nextColumn! < size)
    .map(([nextRow, nextColumn]) => nextRow! * size + nextColumn!)
}

function tieNoise(seed: number, point: number): number {
  let value = (seed ^ Math.imul(point + 1, 0x45d9f3b)) | 0
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000
}

function evaluate(state: GoState, point: number, player: GoPlayer): number {
  const next = playGoMove(state, point)
  const neighbors = adjacent(state.boardSize, point)
  const adjacentFriends = neighbors.filter((cell) => state.board[cell] === player).length
  const adjacentEnemies = neighbors.filter((cell) => state.board[cell] !== null && state.board[cell] !== player).length
  const liberties = getGoGroup(next.board, next.boardSize, point).liberties.length
  const captured = next.prisoners[player] - state.prisoners[player]
  const row = Math.floor(point / state.boardSize)
  const column = point % state.boardSize
  const center = (state.boardSize - 1) / 2
  const centrality = state.boardSize - Math.abs(row - center) - Math.abs(column - center)
  return captured * 100 + adjacentEnemies * 6 + adjacentFriends * 4 + Math.min(liberties, 5) * 3 + centrality * 0.12 - (liberties === 1 ? 20 : 0)
}

/** 固定種子、只回傳規則核心接受的合法落點；難度只調整候選選擇，不改變規則。 */
export function chooseGoMove(state: GoState, difficulty: DifficultyLevel, seed: number): number | null {
  const legal = getLegalGoMoves(state)
  if (legal.length === 0) return null
  const noiseByDifficulty: Record<DifficultyLevel, number> = {
    beginner: 30,
    growth: 12,
    challenge: 3,
    adult: 0,
  }
  const ranked = legal.map((point) => ({
    point,
    score: evaluate(state, point, state.currentPlayer) + tieNoise(seed, point) * noiseByDifficulty[difficulty],
  }))
  ranked.sort((left, right) => right.score - left.score || left.point - right.point)
  const choiceRange = difficulty === 'beginner' ? Math.min(5, ranked.length) : difficulty === 'growth' ? Math.min(3, ranked.length) : 1
  const index = Math.min(choiceRange - 1, Math.floor(tieNoise(seed ^ 0x6d2b79f5, state.moves.length) * choiceRange))
  return ranked[index]?.point ?? null
}
