import type { DifficultyLevel } from '../../components/common-ui'
import { applyReversiMove, getLegalReversiMoves, type ReversiMove, type ReversiPlayer, type ReversiState } from './rules'

interface RankedMove {
  readonly move: ReversiMove
  readonly score: number
}

export interface ReversiAiProfile {
  readonly strategy: 'gentle' | 'growth' | 'search'
  readonly searchDepth: number
  readonly branchLimit: number
}

/**
 * 黑白棋的難度邊界固定記錄在程式資料中，供測試與後續調整共同使用。
 * branchLimit 是每個搜尋節點保留的候選數，不是整棵樹的總葉節點數。
 */
export const REVERSI_AI_PROFILES: Readonly<Record<DifficultyLevel, ReversiAiProfile>> = {
  beginner: { strategy: 'gentle', searchDepth: 0, branchLimit: 3 },
  growth: { strategy: 'growth', searchDepth: 0, branchLimit: 2 },
  challenge: { strategy: 'search', searchDepth: 1, branchLimit: 8 },
  adult: { strategy: 'search', searchDepth: 2, branchLimit: 6 },
}

const CORNERS = new Set<ReversiMove>([0, 7, 56, 63])
const DANGEROUS_CORNER_NEIGHBOURS = new Set<ReversiMove>([1, 8, 9, 6, 14, 15, 48, 49, 57, 54, 55, 62])
const EDGE_MOVES = new Set<ReversiMove>([
  1, 2, 3, 4, 5, 6, 8, 15, 16, 23, 24, 31, 32, 39, 40, 47, 48, 55, 56, 57, 58, 59, 60, 61, 62,
])
const EDGE_LINES: readonly (readonly ReversiMove[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [56, 57, 58, 59, 60, 61, 62, 63],
  [0, 8, 16, 24, 32, 40, 48, 56],
  [7, 15, 23, 31, 39, 47, 55, 63],
]
const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
]

function seededIndex(length: number, seed: number): number {
  if (length === 0) return 0
  const value = Math.abs(Math.floor(Math.sin(seed * 12.9898) * 43758.5453))
  return value % length
}

function tieBreak(move: ReversiMove, seed: number): number {
  return Math.abs(Math.sin((move + 29) * (seed + 17) * 0.61803398875))
}

function playerCount(state: ReversiState, player: ReversiPlayer): number {
  return player === 'black' ? state.blackCount : state.whiteCount
}

function legalMovesForPlayer(state: ReversiState, player: ReversiPlayer): readonly ReversiMove[] {
  if (state.phase !== 'playing') return []
  return getLegalReversiMoves(state.currentPlayer === player ? state : { ...state, currentPlayer: player })
}

function frontierCount(state: ReversiState, player: ReversiPlayer): number {
  let count = 0
  for (let move = 0; move < state.board.length; move += 1) {
    if (state.board[move] !== player) continue
    const row = Math.floor(move / 8)
    const column = move % 8
    const touchesEmpty = NEIGHBOUR_OFFSETS.some(([rowOffset, columnOffset]) => {
      const neighbourRow = row + rowOffset
      const neighbourColumn = column + columnOffset
      return neighbourRow >= 0 && neighbourRow < 8 && neighbourColumn >= 0 && neighbourColumn < 8 &&
        state.board[neighbourRow * 8 + neighbourColumn] === null
    })
    if (touchesEmpty) count += 1
  }
  return count
}

function stableEdgeCount(state: ReversiState, player: ReversiPlayer): number {
  const stable = new Set<ReversiMove>()
  for (const line of EDGE_LINES) {
    for (const move of line) {
      if (state.board[move] !== player) break
      stable.add(move)
    }
    for (const move of [...line].reverse()) {
      if (state.board[move] !== player) break
      stable.add(move)
    }
  }
  return stable.size
}

function cornerIsUnclaimed(move: ReversiMove, state: ReversiState): boolean {
  if (move === 1 || move === 8 || move === 9) return state.board[0] === null
  if (move === 6 || move === 14 || move === 15) return state.board[7] === null
  if (move === 48 || move === 49 || move === 57) return state.board[56] === null
  if (move === 54 || move === 55 || move === 62) return state.board[63] === null
  return false
}

function staticMoveScore(state: ReversiState, move: ReversiMove): number {
  const next = applyReversiMove(state, move)
  const flipped = playerCount(next, state.currentPlayer) - playerCount(state, state.currentPlayer) - 1
  let score = flipped * 40
  if (CORNERS.has(move)) score += 100_000
  if (EDGE_MOVES.has(move)) score += 1_200
  if (DANGEROUS_CORNER_NEIGHBOURS.has(move) && cornerIsUnclaimed(move, state)) score -= 6_000
  return score
}

function rankMoves(state: ReversiState): readonly RankedMove[] {
  return getLegalReversiMoves(state)
    .map((move) => ({ move, score: staticMoveScore(state, move) }))
    .sort((left, right) => right.score - left.score || left.move - right.move)
}

function chooseBest(entries: readonly RankedMove[], seed: number): ReversiMove | null {
  if (entries.length === 0) return null
  const bestScore = entries[0]!.score
  return entries
    .filter((entry) => entry.score === bestScore)
    .sort((left, right) => tieBreak(left.move, seed) - tieBreak(right.move, seed))[0]
    ?.move ?? null
}

function evaluate(state: ReversiState, player: ReversiPlayer): number {
  const opponent: ReversiPlayer = player === 'black' ? 'white' : 'black'
  const pieceDifference = playerCount(state, player) - playerCount(state, opponent)
  const mobility = legalMovesForPlayer(state, player).length - legalMovesForPlayer(state, opponent).length
  const cornerDifference = [...CORNERS].reduce((total, corner) =>
    total + (state.board[corner] === player ? 1 : state.board[corner] === opponent ? -1 : 0), 0)
  const stableDifference = stableEdgeCount(state, player) - stableEdgeCount(state, opponent)
  const frontierDifference = frontierCount(state, opponent) - frontierCount(state, player)
  const emptyCount = state.board.filter((cell) => cell === null).length
  const pieceWeight = emptyCount <= 12 ? 90 : emptyCount <= 24 ? 24 : 4
  return cornerDifference * 20_000 + stableDifference * 900 + mobility * 180 + frontierDifference * 45 + pieceDifference * pieceWeight
}

function minimax(state: ReversiState, rootPlayer: ReversiPlayer, depth: number, branchLimit: number): number {
  if (depth === 0 || state.phase !== 'playing') return evaluate(state, rootPlayer)
  const candidates = rankMoves(state).slice(0, branchLimit)
  if (candidates.length === 0) return evaluate(state, rootPlayer)

  const scores = candidates.map(({ move }) => minimax(applyReversiMove(state, move), rootPlayer, depth - 1, branchLimit))
  return state.currentPlayer === rootPlayer ? Math.max(...scores) : Math.min(...scores)
}

function chooseBeginnerMove(state: ReversiState, seed: number, choiceLimit: number): ReversiMove | null {
  const ranked = rankMoves(state)
  if (ranked.length === 0) return null
  const best = ranked[0]!.score
  const gentleChoices = ranked.filter((entry) => entry.score >= best - 80).slice(0, choiceLimit)
  return gentleChoices[seededIndex(gentleChoices.length, seed)]?.move ?? null
}

function chooseGrowthMove(state: ReversiState, seed: number, choiceLimit: number): ReversiMove | null {
  const ranked = rankMoves(state)
  if (ranked.length === 0) return null
  const evaluated = ranked.map((entry) => {
    const next = applyReversiMove(state, entry.move)
    const mobility = getLegalReversiMoves(next).length
    return { ...entry, score: entry.score - mobility * 120 }
  }).sort((left, right) => right.score - left.score || left.move - right.move)
  const best = evaluated[0]!.score
  const choices = evaluated.filter((entry) => entry.score >= best - 100).slice(0, choiceLimit)
  return choices[seededIndex(choices.length, seed)]?.move ?? null
}

function chooseSearchMove(state: ReversiState, seed: number, searchDepth: number, branchLimit: number): ReversiMove | null {
  const ranked = rankMoves(state).slice(0, branchLimit)
  const scored = ranked.map((entry) => ({
    ...entry,
    score: minimax(applyReversiMove(state, entry.move), state.currentPlayer, searchDepth, branchLimit),
  })).sort((left, right) => right.score - left.score || left.move - right.move)
  return chooseBest(scored, seed)
}

export function chooseReversiMove(state: ReversiState, difficulty: DifficultyLevel, seed: number): ReversiMove | null {
  if (state.phase !== 'playing') return null
  const profile = REVERSI_AI_PROFILES[difficulty]
  if (profile.strategy === 'gentle') return chooseBeginnerMove(state, seed, profile.branchLimit)
  if (profile.strategy === 'growth') return chooseGrowthMove(state, seed, profile.branchLimit)
  return chooseSearchMove(state, seed, profile.searchDepth, profile.branchLimit)
}
