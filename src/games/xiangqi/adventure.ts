import {
  XIANGQI_BOARD_CELLS,
  applyMove,
  createInitialXiangqiState,
  getLegalMovesFrom,
  isInCheck,
  positionKey,
  type XiangqiCell,
  type XiangqiPlacement,
  type XiangqiState,
} from './rules'

export interface XiangqiTutorialTask {
  readonly id: string
  readonly placements: readonly XiangqiPlacement[]
  readonly from: number
  readonly to: number
  readonly acceptedMoves?: readonly { readonly from: number; readonly to: number }[]
}

export interface XiangqiTutorialLevel {
  readonly id: string
  readonly titleTextId: string
  readonly instructionTextId: string
  readonly hintAreaTextId: string
  readonly tasks: readonly XiangqiTutorialTask[]
}

const at = (row: number, column: number) => row * 9 + column
const basePieces: readonly XiangqiPlacement[] = [
  { owner: 'red', kind: 'king', row: 9, column: 4 },
  { owner: 'black', kind: 'king', row: 0, column: 3 },
  { owner: 'black', kind: 'chariot', row: 0, column: 8 },
]

function task(
  id: string,
  piece: XiangqiPlacement,
  from: readonly [number, number],
  to: readonly [number, number],
  extra: readonly XiangqiPlacement[] = [],
): XiangqiTutorialTask {
  return { id, placements: [...basePieces, piece, ...extra], from: at(...from), to: at(...to) }
}

export const XIANGQI_TUTORIAL_LEVELS: readonly XiangqiTutorialLevel[] = [
  {
    id: 'board-and-turns', titleTextId: 'xiangqi.lesson_1_title',
    instructionTextId: 'xiangqi.lesson_1_instruction', hintAreaTextId: 'xiangqi.lesson_hint_soldier',
    tasks: [task('red-soldier-forward', { owner: 'red', kind: 'soldier', row: 6, column: 0 }, [6, 0], [5, 0])],
  },
  {
    id: 'chariot-and-cannon', titleTextId: 'xiangqi.lesson_2_title',
    instructionTextId: 'xiangqi.lesson_2_instruction', hintAreaTextId: 'xiangqi.lesson_hint_line',
    tasks: [
      task('chariot-straight', { owner: 'red', kind: 'chariot', row: 7, column: 0 }, [7, 0], [7, 4]),
      task('cannon-one-screen', { owner: 'red', kind: 'cannon', row: 5, column: 0 }, [5, 0], [5, 3], [
        { owner: 'black', kind: 'soldier', row: 5, column: 1 },
        { owner: 'black', kind: 'chariot', row: 5, column: 3 },
      ]),
    ],
  },
  {
    id: 'horse-and-elephant', titleTextId: 'xiangqi.lesson_3_title',
    instructionTextId: 'xiangqi.lesson_3_instruction', hintAreaTextId: 'xiangqi.lesson_hint_diagonal',
    tasks: [
      task('horse-leg', { owner: 'red', kind: 'horse', row: 5, column: 2 }, [5, 2], [3, 3]),
      task('elephant-eye', { owner: 'red', kind: 'elephant', row: 7, column: 2 }, [7, 2], [5, 0]),
    ],
  },
  {
    id: 'palace-and-king', titleTextId: 'xiangqi.lesson_4_title',
    instructionTextId: 'xiangqi.lesson_4_instruction', hintAreaTextId: 'xiangqi.lesson_hint_palace',
    tasks: [
      task('advisor-palace-diagonal', { owner: 'red', kind: 'advisor', row: 8, column: 3 }, [8, 3], [7, 4]),
      task('king-palace-step', { owner: 'red', kind: 'king', row: 9, column: 4 }, [9, 4], [8, 4]),
    ],
  },
  {
    id: 'soldier-cross-river', titleTextId: 'xiangqi.lesson_5_title',
    instructionTextId: 'xiangqi.lesson_5_instruction', hintAreaTextId: 'xiangqi.lesson_hint_crossed_soldier',
    tasks: [task('crossed-soldier-sideways', { owner: 'red', kind: 'soldier', row: 4, column: 4 }, [4, 4], [4, 3])],
  },
  {
    id: 'check-and-escape', titleTextId: 'xiangqi.lesson_6_title',
    instructionTextId: 'xiangqi.lesson_6_instruction', hintAreaTextId: 'xiangqi.lesson_hint_escape',
    tasks: [{
      ...task('escape-check', { owner: 'red', kind: 'king', row: 9, column: 4 }, [9, 4], [9, 3], [
        { owner: 'black', kind: 'chariot', row: 8, column: 4 },
      ]),
      acceptedMoves: [
        { from: at(9, 4), to: at(9, 5) },
        { from: at(9, 4), to: at(8, 4) },
      ],
    }],
  },
]

export function getXiangqiTutorialTask(levelIndex: number, taskIndex: number): XiangqiTutorialTask {
  const level = XIANGQI_TUTORIAL_LEVELS[levelIndex]
  const currentTask = level?.tasks[taskIndex]
  if (currentTask === undefined) throw new RangeError('象棋教學關卡索引超出範圍。')
  return currentTask
}

export function createXiangqiTutorialState(levelIndex: number, taskIndex: number): XiangqiState {
  const currentTask = getXiangqiTutorialTask(levelIndex, taskIndex)
  const board: XiangqiCell[] = Array.from({ length: XIANGQI_BOARD_CELLS }, () => null)
  const counters = new Map<string, number>()
  for (const placement of currentTask.placements) {
    const key = `${placement.owner}-${placement.kind}`
    const count = (counters.get(key) ?? 0) + 1
    counters.set(key, count)
    const piece = { ...placement, id: `${key}-${count}` }
    board[at(piece.row, piece.column)] = piece
  }

  const base = createInitialXiangqiState()
  const prepared = {
    ...base,
    board,
    currentPlayer: 'red' as const,
    phase: 'playing' as const,
    winner: null,
    drawReason: null,
    positionHistory: [] as readonly string[],
    repetitionCounts: {} as Readonly<Record<string, number>>,
    turns: [],
  }
  const phase: XiangqiState['phase'] = isInCheck(prepared, 'red') ? 'check' : 'playing'
  const state = { ...prepared, phase }
  const key = positionKey(state)
  return { ...state, positionHistory: [key], repetitionCounts: { [key]: 1 } }
}

export function isCorrectXiangqiTutorialMove(
  state: XiangqiState,
  currentTask: XiangqiTutorialTask,
  from: number,
  to: number,
): boolean {
  const accepted = currentTask.acceptedMoves ?? [{ from: currentTask.from, to: currentTask.to }]
  return accepted.some((candidate) => candidate.from === from && candidate.to === to) &&
    getLegalMovesFrom(state, from).some((move) => move.to === to)
}

export function getXiangqiTutorialSolutions(currentTask: XiangqiTutorialTask): readonly { readonly from: number; readonly to: number }[] {
  return currentTask.acceptedMoves ?? [{ from: currentTask.from, to: currentTask.to }]
}

export function completeXiangqiTutorialMove(state: XiangqiState, from: number, to: number): XiangqiState {
  return applyMove(state, from, to)
}
