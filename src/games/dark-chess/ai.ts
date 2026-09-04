import type { DifficultyLevel } from '../../components/common-ui'
import {
  applyDarkChessAction,
  getLegalPublicDarkChessActions,
  getLegalPublicDarkChessActionsForPlayer,
  getNpcDrawResponse,
  getPublicDarkChessState,
  type DarkChessAction,
  type DarkChessPieceKind,
  type DarkChessPlayer,
  type DarkChessPublicState,
  type DarkChessState,
} from './rules'

export interface DarkChessAiProfile {
  readonly strategy: 'gentle' | 'growth' | 'search'
  readonly searchDepth: number
  readonly branchLimit: number
}

/**
 * 暗棋的四階 NPC 邊界固定記錄在程式資料中。
 * 挑戰為一層搜尋、最多八個候選；成人版為兩層搜尋、最多六個候選。
 */
export const DARK_CHESS_AI_PROFILES: Readonly<Record<DifficultyLevel, DarkChessAiProfile>> = {
  beginner: { strategy: 'gentle', searchDepth: 0, branchLimit: 3 },
  growth: { strategy: 'growth', searchDepth: 0, branchLimit: 2 },
  challenge: { strategy: 'search', searchDepth: 1, branchLimit: 8 },
  adult: { strategy: 'search', searchDepth: 2, branchLimit: 6 },
}

const PIECE_VALUE: Readonly<Record<DarkChessPieceKind, number>> = {
  soldier: 100,
  cannon: 220,
  horse: 320,
  chariot: 500,
  elephant: 650,
  advisor: 800,
  general: 1_000,
}

function seededIndex(length: number, seed: number): number {
  if (length === 0) return 0
  const value = Math.abs(Math.floor(Math.sin(seed * 12.9898) * 43758.5453))
  return value % length
}

function actionKey(action: DarkChessAction): string {
  if (action.kind === 'flip') return `flip:${action.cell}`
  if (action.kind === 'move' || action.kind === 'capture') return `${action.kind}:${action.from}:${action.to}`
  if (action.kind === 'draw-offer') return 'draw-offer'
  return `draw-response:${action.response}`
}

function tieBreak(action: DarkChessAction, seed: number): number {
  let hash = 0
  for (const character of actionKey(action)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return Math.abs(Math.sin((hash + 17) * (seed + 29) * 0.61803398875))
}

function currentColor(state: DarkChessPublicState, player: DarkChessPlayer) {
  return state.playerColors[player]
}

function staticActionScore(state: DarkChessPublicState, action: DarkChessAction, rootPlayer: DarkChessPlayer): number {
  if (action.kind === 'draw-offer' || action.kind === 'draw-response') return -10_000
  if (action.kind === 'flip') return 0

  const actor = state.currentPlayer
  const direction = actor === rootPlayer ? 1 : -1
  if (action.kind === 'capture') {
    const target = state.board[action.to]
    const targetValue = target?.kind === null || target?.kind === undefined ? 0 : PIECE_VALUE[target.kind]
    return direction * (10_000 + targetValue)
  }

  const moving = state.board[action.from]
  const movingValue = moving?.kind === null || moving?.kind === undefined ? 0 : PIECE_VALUE[moving.kind]
  return direction * (movingValue > 0 ? 25 : 0)
}

function rankActions(state: DarkChessPublicState, rootPlayer: DarkChessPlayer, seed: number): readonly DarkChessAction[] {
  return getLegalPublicDarkChessActions(state)
    .map((action) => ({ action, score: staticActionScore(state, action, rootPlayer) }))
    .sort((left, right) => right.score - left.score || tieBreak(left.action, seed) - tieBreak(right.action, seed))
    .map(({ action }) => action)
}

function knownMaterial(state: DarkChessPublicState, player: DarkChessPlayer): number {
  const color = currentColor(state, player)
  if (color === null) return 0
  return state.board.reduce((total, piece) => {
    if (piece?.revealed !== true || piece.color !== color || piece.kind === null) return total
    return total + PIECE_VALUE[piece.kind]
  }, 0)
}

function knownMobility(state: DarkChessPublicState, player: DarkChessPlayer): number {
  return getLegalPublicDarkChessActionsForPlayer(state, player)
    .filter((action) => action.kind !== 'flip')
    .length
}

function evaluate(state: DarkChessPublicState, rootPlayer: DarkChessPlayer): number {
  if (state.phase === 'won') return state.winner === rootPlayer ? 1_000_000 : -1_000_000
  if (state.phase === 'draw') return 0
  const opponent: DarkChessPlayer = rootPlayer === 'player1' ? 'player2' : 'player1'
  const material = knownMaterial(state, rootPlayer) - knownMaterial(state, opponent)
  const mobility = knownMobility(state, rootPlayer) - knownMobility(state, opponent)
  return material + mobility * 40 - state.quietStreak
}

/**
 * 翻棋的結果在行動前是未知資訊，因此搜尋不能把完整 state 套入後讀取翻出的棋子。
 * 只有不會揭露暗棋內容的走子／吃子才進入下一層；翻棋只以公開的中性候選處理。
 */
function applyKnownAction(state: DarkChessState, action: DarkChessAction): DarkChessState | null {
  if (action.kind === 'flip' || action.kind === 'draw-offer' || action.kind === 'draw-response') return null
  try {
    return applyDarkChessAction(state, action)
  } catch {
    return null
  }
}

function minimax(state: DarkChessState, rootPlayer: DarkChessPlayer, depth: number, branchLimit: number, seed: number): number {
  const publicState = getPublicDarkChessState(state)
  if (depth === 0 || publicState.phase !== 'playing') return evaluate(publicState, rootPlayer)
  const candidates = rankActions(publicState, rootPlayer, seed).slice(0, branchLimit)
  if (candidates.length === 0) return evaluate(publicState, rootPlayer)

  const scores = candidates.map((action) => {
    const next = applyKnownAction(state, action)
    return next === null ? staticActionScore(publicState, action, rootPlayer) : minimax(next, rootPlayer, depth - 1, branchLimit, seed + 1)
  })
  return state.currentPlayer === rootPlayer ? Math.max(...scores) : Math.min(...scores)
}

function chooseGentleAction(state: DarkChessState, seed: number, choiceLimit: number): DarkChessAction | null {
  const publicState = getPublicDarkChessState(state)
  const choices = rankActions(publicState, state.currentPlayer, seed).slice(0, choiceLimit)
  return choices[seededIndex(choices.length, seed)] ?? null
}

function chooseGrowthAction(state: DarkChessState, seed: number, choiceLimit: number): DarkChessAction | null {
  const publicState = getPublicDarkChessState(state)
  const choices = [...rankActions(publicState, state.currentPlayer, seed)]
    .sort((left, right) => {
      const leftCapture = left.kind === 'capture' ? 1 : 0
      const rightCapture = right.kind === 'capture' ? 1 : 0
      return rightCapture - leftCapture || tieBreak(left, seed) - tieBreak(right, seed)
    })
    .slice(0, choiceLimit)
  return choices[seededIndex(choices.length, seed)] ?? null
}

function chooseSearchAction(state: DarkChessState, seed: number, searchDepth: number, branchLimit: number): DarkChessAction | null {
  const publicState = getPublicDarkChessState(state)
  const rootPlayer = state.currentPlayer
  const candidates = rankActions(publicState, rootPlayer, seed).slice(0, branchLimit)
  const scored = candidates.map((action) => {
    const next = applyKnownAction(state, action)
    return {
      action,
      score: next === null
        ? staticActionScore(publicState, action, rootPlayer)
        : minimax(next, rootPlayer, searchDepth - 1, branchLimit, seed + 1),
    }
  }).sort((left, right) => right.score - left.score || tieBreak(left.action, seed) - tieBreak(right.action, seed))
  const bestScore = scored[0]?.score
  if (bestScore === undefined) return null
  const best = scored.filter((entry) => entry.score === bestScore)
  return best[seededIndex(best.length, seed)]?.action ?? null
}

export function chooseDarkChessAction(state: DarkChessState, difficulty: DifficultyLevel, seed: number): DarkChessAction | null {
  if (state.phase !== 'playing') return null
  if (state.drawOffer !== null) return { kind: 'draw-response', response: getNpcDrawResponse(state) }

  const profile = DARK_CHESS_AI_PROFILES[difficulty]
  if (profile.strategy === 'gentle') return chooseGentleAction(state, seed, profile.branchLimit)
  if (profile.strategy === 'growth') return chooseGrowthAction(state, seed, profile.branchLimit)
  return chooseSearchAction(state, seed, profile.searchDepth, profile.branchLimit)
}
