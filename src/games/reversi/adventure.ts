import { getFlips, getLegalReversiMoves, replayReversiMoves, type ReversiMove, type ReversiState } from './rules'

export type ReversiAdventureLevelId =
  | 'opening'
  | 'single-line'
  | 'multiple-directions'
  | 'protect-corner'
  | 'forced-pass'
  | 'short-game'

export type ReversiAdventureGoal =
  | 'any-legal'
  | 'single-flip'
  | 'multiple-flips'
  | 'corner'

export interface ReversiAdventureLevel {
  readonly id: ReversiAdventureLevelId
  readonly titleTextId: string
  readonly instructionTextId: string
  readonly initialMoves: readonly ReversiMove[]
  readonly targetMoves: readonly ReversiMove[]
  readonly goal: ReversiAdventureGoal
  readonly maxFlips?: number
  readonly minFlips?: number
}

const CORNERS = new Set<ReversiMove>([0, 7, 56, 63])

export const REVERSI_ADVENTURE_LEVELS: readonly ReversiAdventureLevel[] = [
  {
    id: 'opening',
    titleTextId: 'reversi.adventure_level_opening',
    instructionTextId: 'reversi.adventure_instruction_opening',
    initialMoves: [],
    targetMoves: [19, 26, 37, 44],
    goal: 'any-legal',
  },
  {
    id: 'single-line',
    titleTextId: 'reversi.adventure_level_single',
    instructionTextId: 'reversi.adventure_instruction_single',
    // 固定只保留一個合法落點，讓兒童能清楚看見「包住一條線」的操作目標。
    initialMoves: [26, 18, 44, 25, 24, 34, 43, 32, 9, 16],
    targetMoves: [17],
    goal: 'single-flip',
    maxFlips: 1,
  },
  {
    id: 'multiple-directions',
    titleTextId: 'reversi.adventure_level_multiple',
    instructionTextId: 'reversi.adventure_instruction_multiple',
    initialMoves: [44, 43],
    targetMoves: [26, 42],
    goal: 'multiple-flips',
    minFlips: 2,
  },
  {
    id: 'protect-corner',
    titleTextId: 'reversi.adventure_level_corner',
    instructionTextId: 'reversi.adventure_instruction_corner',
    initialMoves: [
      44, 43, 50, 21, 26, 52, 29, 37, 38, 57, 20, 18, 51, 42, 60, 53,
      45, 30, 46, 11, 59, 47, 41, 40, 22, 23, 2, 62, 34, 49, 58, 33,
    ],
    targetMoves: [56],
    goal: 'corner',
  },
  {
    id: 'forced-pass',
    titleTextId: 'reversi.adventure_level_pass',
    instructionTextId: 'reversi.adventure_instruction_pass',
    initialMoves: [
      26, 34, 42, 33, 41, 18, 40, 29, 21, 20, 30, 32, 13, 14, 7, 6,
      10, 37, 44, 22, 24, 43, 12, 31, 45, 25, 19, 17, 39, 50, 57, 46,
      38, 48, 15, 5, 53, 62, 3, 59, 58, 49, 9, 47, 56, 4, 61, 1, 16,
      52, 51, 8, 2, 23, 60, 11, 0,
    ],
    targetMoves: [54, 55, 63],
    goal: 'any-legal',
  },
  {
    id: 'short-game',
    titleTextId: 'reversi.adventure_level_short',
    instructionTextId: 'reversi.adventure_instruction_short',
    initialMoves: [44, 43, 50, 21, 26, 52, 29, 37, 38, 57],
    targetMoves: [13, 14, 20, 30, 45, 51, 53, 60],
    goal: 'any-legal',
  },
]

export function getReversiAdventureLevel(id: ReversiAdventureLevelId): ReversiAdventureLevel {
  const level = REVERSI_ADVENTURE_LEVELS.find((candidate) => candidate.id === id)
  if (level === undefined) throw new Error(`找不到黑白棋冒險關卡：${id}`)
  return level
}

export function createReversiAdventureState(level: ReversiAdventureLevel): ReversiState {
  return replayReversiMoves(level.initialMoves)
}

export function isReversiAdventureMoveCorrect(
  level: ReversiAdventureLevel,
  state: ReversiState,
  move: ReversiMove,
): boolean {
  if (!getLegalReversiMoves(state).includes(move)) return false
  const flips = getFlips(state, move)
  if (level.goal === 'any-legal') return true
  if (level.goal === 'corner') return CORNERS.has(move)
  if (level.goal === 'single-flip') return flips.length <= (level.maxFlips ?? Number.POSITIVE_INFINITY)
  if (level.goal === 'multiple-flips') return flips.length >= (level.minFlips ?? 2)
  return level.targetMoves.includes(move)
}

export function isReversiAdventureStateComplete(level: ReversiAdventureLevel, state: ReversiState): boolean {
  return state.turns.length > createReversiAdventureState(level).turns.length
}

export function nextReversiAdventureLevel(levelId: ReversiAdventureLevelId): ReversiAdventureLevel | null {
  const index = REVERSI_ADVENTURE_LEVELS.findIndex((level) => level.id === levelId)
  return REVERSI_ADVENTURE_LEVELS[index + 1] ?? null
}
