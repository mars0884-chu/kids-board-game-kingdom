import {
  isLegalGomokuMove,
  playGomokuMove,
  replayGomokuMoves,
  type GomokuMove,
  type GomokuState,
} from './rules'

export type GomokuAdventureLevelId =
  | 'connect-five'
  | 'block-four'
  | 'open-four'
  | 'avoid-double-three'

export type GomokuAdventureGoal = 'complete-five' | 'block-four' | 'open-four' | 'safe-move'

export interface GomokuAdventureLevel {
  readonly id: GomokuAdventureLevelId
  readonly titleTextId: string
  readonly instructionTextId: string
  readonly initialMoves: readonly GomokuMove[]
  readonly targetMoves: readonly GomokuMove[]
  readonly goal: GomokuAdventureGoal
  readonly forbiddenMove?: GomokuMove
  /** 第四關以「選擇任何合法位置」驗證避開禁手，候選格只供提示示範。 */
  readonly acceptsAnyLegalMove?: boolean
}

const at = (row: number, column: number): GomokuMove => row * 15 + column

export const GOMOKU_ADVENTURE_LEVELS: readonly GomokuAdventureLevel[] = [
  {
    id: 'connect-five',
    titleTextId: 'gomoku.adventure_level_connect',
    instructionTextId: 'gomoku.adventure_instruction_connect',
    initialMoves: [at(7, 7), at(0, 0), at(7, 8), at(0, 2), at(7, 9), at(0, 4), at(7, 10), at(0, 6)],
    targetMoves: [at(7, 6), at(7, 11)],
    goal: 'complete-five',
  },
  {
    id: 'block-four',
    titleTextId: 'gomoku.adventure_level_block',
    instructionTextId: 'gomoku.adventure_instruction_block',
    initialMoves: [at(7, 6), at(7, 7), at(0, 0), at(7, 8), at(0, 2), at(7, 9), at(0, 4), at(7, 10)],
    targetMoves: [at(7, 11)],
    goal: 'block-four',
  },
  {
    id: 'open-four',
    titleTextId: 'gomoku.adventure_level_open_four',
    instructionTextId: 'gomoku.adventure_instruction_open_four',
    initialMoves: [at(7, 4), at(0, 0), at(7, 5), at(0, 2), at(7, 6), at(0, 4), at(1, 0), at(1, 2)],
    targetMoves: [at(7, 3), at(7, 7)],
    goal: 'open-four',
  },
  {
    id: 'avoid-double-three',
    titleTextId: 'gomoku.adventure_level_forbidden',
    instructionTextId: 'gomoku.adventure_instruction_forbidden',
    initialMoves: [at(7, 6), at(0, 0), at(7, 8), at(0, 2), at(6, 7), at(0, 4), at(8, 7), at(0, 6)],
    targetMoves: [at(1, 1)],
    goal: 'safe-move',
    forbiddenMove: at(7, 7),
    acceptsAnyLegalMove: true,
  },
]

export function getGomokuAdventureLevel(id: GomokuAdventureLevelId): GomokuAdventureLevel {
  const level = GOMOKU_ADVENTURE_LEVELS.find((candidate) => candidate.id === id)
  if (level === undefined) throw new Error(`找不到五子棋冒險關卡：${id}`)
  return level
}

export function createGomokuAdventureState(level: GomokuAdventureLevel): GomokuState {
  return replayGomokuMoves(level.initialMoves)
}

export function isGomokuAdventureMoveCorrect(
  level: GomokuAdventureLevel,
  state: GomokuState,
  move: GomokuMove,
): boolean {
  if (!isLegalGomokuMove(state, move)) return false
  return level.acceptsAnyLegalMove === true || level.targetMoves.includes(move)
}

export function completesGomokuAdventureLevel(
  level: GomokuAdventureLevel,
  state: GomokuState,
  move: GomokuMove,
): boolean {
  if (!isGomokuAdventureMoveCorrect(level, state, move)) return false
  const next = playGomokuMove(state, move)
  return level.goal !== 'complete-five' || (next.phase === 'won' && next.winner === 'black')
}

export function isGomokuAdventureStateComplete(level: GomokuAdventureLevel, state: GomokuState): boolean {
  if (state.moves.length <= level.initialMoves.length) return false
  const lastMove = state.moves[state.moves.length - 1]?.move
  if (lastMove === undefined) return false
  if (level.acceptsAnyLegalMove === true) return true
  if (!level.targetMoves.includes(lastMove)) return false
  return level.goal !== 'complete-five' || (state.phase === 'won' && state.winner === 'black')
}

export function nextGomokuAdventureLevel(levelId: GomokuAdventureLevelId): GomokuAdventureLevel | null {
  const index = GOMOKU_ADVENTURE_LEVELS.findIndex((level) => level.id === levelId)
  return GOMOKU_ADVENTURE_LEVELS[index + 1] ?? null
}
