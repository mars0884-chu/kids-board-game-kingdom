import type { TurnGamePhase, TurnGameRules, TurnMoveRecord } from '../core/turn-game'

export type GomokuPlayer = 'black' | 'white'
export type GomokuCell = GomokuPlayer | null
export type GomokuMove = number
export type GomokuWinningLine = readonly [number, number, number, number, number]
export type GomokuMoveRecord = TurnMoveRecord<GomokuPlayer, GomokuMove>
export type GomokuForbiddenReason = 'overline' | 'double-three' | 'double-four'

export const GOMOKU_BOARD_SIZE = 15
export const GOMOKU_BOARD_CELLS = GOMOKU_BOARD_SIZE * GOMOKU_BOARD_SIZE

type Direction = readonly [number, number]
const DIRECTIONS: readonly Direction[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

export interface GomokuState {
  readonly version: 1
  readonly boardSize: 15
  readonly startingPlayer: 'black'
  readonly board: readonly GomokuCell[]
  readonly currentPlayer: GomokuPlayer
  readonly phase: TurnGamePhase
  readonly winner: GomokuPlayer | null
  readonly winningLine: GomokuWinningLine | null
  readonly moves: readonly GomokuMoveRecord[]
}

export interface GomokuMoveEvaluation {
  readonly forbiddenReason: GomokuForbiddenReason | null
  readonly phase: TurnGamePhase
  readonly winner: GomokuPlayer | null
  readonly winningLine: GomokuWinningLine | null
}

function otherPlayer(player: GomokuPlayer): GomokuPlayer {
  return player === 'black' ? 'white' : 'black'
}

function isPlayer(value: unknown): value is GomokuPlayer {
  return value === 'black' || value === 'white'
}

function isMove(value: unknown): value is GomokuMove {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < GOMOKU_BOARD_CELLS
}

function toRowColumn(move: number): readonly [number, number] {
  return [Math.floor(move / GOMOKU_BOARD_SIZE), move % GOMOKU_BOARD_SIZE]
}

function toMove(row: number, column: number): number {
  return row * GOMOKU_BOARD_SIZE + column
}

function inBounds(row: number, column: number): boolean {
  return row >= 0 && row < GOMOKU_BOARD_SIZE && column >= 0 && column < GOMOKU_BOARD_SIZE
}

function collectRun(board: readonly GomokuCell[], move: number, player: GomokuPlayer, direction: Direction): number[] {
  const [row, column] = toRowColumn(move)
  const [rowStep, columnStep] = direction
  const result: number[] = [move]

  for (const sign of [-1, 1]) {
    let nextRow = row + rowStep * sign
    let nextColumn = column + columnStep * sign
    const side: number[] = []
    while (inBounds(nextRow, nextColumn) && board[toMove(nextRow, nextColumn)] === player) {
      side.push(toMove(nextRow, nextColumn))
      nextRow += rowStep * sign
      nextColumn += columnStep * sign
    }
    if (sign === -1) {
      result.unshift(...side.reverse())
    } else {
      result.push(...side)
    }
  }

  return result
}

function findFiveLine(board: readonly GomokuCell[], move: number, player: GomokuPlayer): GomokuWinningLine | null {
  for (const direction of DIRECTIONS) {
    const run = collectRun(board, move, player, direction)
    if (run.length < 5) {
      continue
    }

    const moveIndex = run.indexOf(move)
    const start = Math.max(0, Math.min(moveIndex - 4, run.length - 5))
    const line = run.slice(start, start + 5)
    return line as unknown as GomokuWinningLine
  }
  return null
}

function hasOverline(board: readonly GomokuCell[], move: number): boolean {
  return DIRECTIONS.some((direction) => collectRun(board, move, 'black', direction).length > 5)
}

function countWinningExtensionsInDirection(
  board: readonly GomokuCell[],
  move: number,
  direction: Direction,
  anchor: number = move,
): number {
  const [row, column] = toRowColumn(move)
  const [rowStep, columnStep] = direction
  const candidates = new Set<number>()

  for (let distance = -GOMOKU_BOARD_SIZE; distance <= GOMOKU_BOARD_SIZE; distance += 1) {
    const candidateRow = row + rowStep * distance
    const candidateColumn = column + columnStep * distance
    if (!inBounds(candidateRow, candidateColumn)) {
      continue
    }
    const candidate = toMove(candidateRow, candidateColumn)
    if (board[candidate] !== null) {
      continue
    }
    const nextBoard = [...board]
    nextBoard[candidate] = 'black'
    const run = collectRun(nextBoard, candidate, 'black', direction)
    if (run.length === 5 && run.includes(anchor)) {
      candidates.add(candidate)
    }
  }

  return candidates.size
}

function createsOpenFourInDirection(board: readonly GomokuCell[], move: number, direction: Direction): boolean {
  const [row, column] = toRowColumn(move)
  const [rowStep, columnStep] = direction

  for (let distance = -GOMOKU_BOARD_SIZE; distance <= GOMOKU_BOARD_SIZE; distance += 1) {
    const candidateRow = row + rowStep * distance
    const candidateColumn = column + columnStep * distance
    if (!inBounds(candidateRow, candidateColumn)) {
      continue
    }
    const candidate = toMove(candidateRow, candidateColumn)
    if (board[candidate] !== null) {
      continue
    }
    const nextBoard = [...board]
    nextBoard[candidate] = 'black'
    if (findFiveLine(nextBoard, candidate, 'black') !== null) {
      continue
    }
    if (countWinningExtensionsInDirection(nextBoard, candidate, direction, move) >= 2) {
      return true
    }
  }

  return false
}

function hasDoubleFour(board: readonly GomokuCell[], move: number): boolean {
  return DIRECTIONS.filter((direction) => countWinningExtensionsInDirection(board, move, direction) > 0).length >= 2
}

function hasDoubleThree(board: readonly GomokuCell[], move: number): boolean {
  return DIRECTIONS.filter((direction) => createsOpenFourInDirection(board, move, direction)).length >= 2
}

export function evaluateGomokuMove(board: readonly GomokuCell[], move: GomokuMove, player: GomokuPlayer): GomokuMoveEvaluation {
  if (board.length !== GOMOKU_BOARD_CELLS) {
    throw new Error('五子棋棋盤必須是 15×15，共 225 個落子位置。')
  }

  if (!isMove(move) || board[move] !== player) {
    throw new Error('五子棋評估位置必須是剛落下的棋子。')
  }

  if (player === 'black') {
    if (hasOverline(board, move)) {
      return { forbiddenReason: 'overline', phase: 'playing', winner: null, winningLine: null }
    }

    const winningLine = findFiveLine(board, move, player)
    if (winningLine !== null) {
      return { forbiddenReason: null, phase: 'won', winner: player, winningLine }
    }

    if (hasDoubleFour(board, move)) {
      return { forbiddenReason: 'double-four', phase: 'playing', winner: null, winningLine: null }
    }
    if (hasDoubleThree(board, move)) {
      return { forbiddenReason: 'double-three', phase: 'playing', winner: null, winningLine: null }
    }
  } else {
    const winningLine = findFiveLine(board, move, player)
    if (winningLine !== null) {
      return { forbiddenReason: null, phase: 'won', winner: player, winningLine }
    }
  }

  if (board.every((cell) => cell !== null)) {
    return { forbiddenReason: null, phase: 'draw', winner: null, winningLine: null }
  }

  return { forbiddenReason: null, phase: 'playing', winner: null, winningLine: null }
}

export function createGomokuState(): GomokuState {
  return {
    version: 1,
    boardSize: GOMOKU_BOARD_SIZE,
    startingPlayer: 'black',
    board: Array<GomokuCell>(GOMOKU_BOARD_CELLS).fill(null),
    currentPlayer: 'black',
    phase: 'playing',
    winner: null,
    winningLine: null,
    moves: [],
  }
}

export function isLegalGomokuMove(state: GomokuState, move: GomokuMove): boolean {
  if (state.phase !== 'playing' || !isMove(move) || state.board[move] !== null) {
    return false
  }
  const board = [...state.board]
  board[move] = state.currentPlayer
  return evaluateGomokuMove(board, move, state.currentPlayer).forbiddenReason === null
}

/** 禁手不會改變局面；介面可用此函式說明原因並讓孩子另選位置。 */
export function getGomokuForbiddenReason(state: GomokuState, move: GomokuMove): GomokuForbiddenReason | null {
  if (state.phase !== 'playing' || !isMove(move) || state.board[move] !== null) return null
  const board = [...state.board]
  board[move] = state.currentPlayer
  return evaluateGomokuMove(board, move, state.currentPlayer).forbiddenReason
}

export function getLegalGomokuMoves(state: GomokuState): readonly GomokuMove[] {
  if (state.phase !== 'playing') {
    return []
  }
  return state.board.flatMap((cell, move) => cell === null && isLegalGomokuMove(state, move) ? [move] : [])
}

export function playGomokuMove(state: GomokuState, move: GomokuMove): GomokuState {
  if (!isMove(move)) {
    throw new Error('五子棋位置必須是 0 到 224 的整數。')
  }
  if (state.phase !== 'playing') {
    throw new Error('對局已經結束，不能繼續落子。')
  }
  if (state.board[move] !== null) {
    throw new Error('這一個落點已經有棋子。')
  }

  const board = [...state.board]
  board[move] = state.currentPlayer
  const result = evaluateGomokuMove(board, move, state.currentPlayer)
  if (result.forbiddenReason !== null) {
    throw new Error(`黑方禁手：${result.forbiddenReason}。`)
  }

  return {
    ...state,
    board,
    currentPlayer: result.phase === 'playing' ? otherPlayer(state.currentPlayer) : state.currentPlayer,
    phase: result.phase,
    winner: result.winner,
    winningLine: result.winningLine,
    moves: [...state.moves, { player: state.currentPlayer, move }],
  }
}

export function replayGomokuMoves(moves: readonly GomokuMove[]): GomokuState {
  return moves.reduce(playGomokuMove, createGomokuState())
}

export function serializeGomokuState(state: GomokuState): string {
  return JSON.stringify(state)
}

function sameBoard(left: readonly GomokuCell[], right: unknown): boolean {
  return Array.isArray(right) && right.length === GOMOKU_BOARD_CELLS && right.every((cell, index) =>
    (cell === null || isPlayer(cell)) && cell === left[index],
  )
}

function sameWinningLine(left: GomokuWinningLine | null, right: unknown): boolean {
  if (left === null) {
    return right === null
  }
  return Array.isArray(right) && right.length === 5 && right.every((move, index) => move === left[index])
}

export function deserializeGomokuState(serialized: string): GomokuState {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('五子棋存檔不是有效的 JSON。')
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('五子棋存檔格式不正確。')
  }

  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || candidate.boardSize !== GOMOKU_BOARD_SIZE || candidate.startingPlayer !== 'black' || !Array.isArray(candidate.moves)) {
    throw new Error('五子棋存檔版本、棋盤尺寸、先手或走棋紀錄不正確。')
  }

  const moves: GomokuMove[] = []
  for (const [index, record] of candidate.moves.entries()) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      throw new Error('五子棋走棋紀錄格式不正確。')
    }
    const moveRecord = record as Record<string, unknown>
    const expectedPlayer: GomokuPlayer = index % 2 === 0 ? 'black' : 'white'
    if (moveRecord.player !== expectedPlayer || !isMove(moveRecord.move)) {
      throw new Error('五子棋走棋順序或位置不正確。')
    }
    moves.push(moveRecord.move)
  }

  let replayed: GomokuState
  try {
    replayed = replayGomokuMoves(moves)
  } catch {
    throw new Error('五子棋走棋紀錄包含不合法步驟。')
  }

  const valid = sameBoard(replayed.board, candidate.board) &&
    candidate.currentPlayer === replayed.currentPlayer &&
    candidate.phase === replayed.phase &&
    candidate.winner === replayed.winner &&
    sameWinningLine(replayed.winningLine, candidate.winningLine)

  if (!valid) {
    throw new Error('五子棋存檔內容與走棋紀錄不一致。')
  }

  return replayed
}

export const gomokuRules: TurnGameRules<GomokuState, GomokuMove> = {
  createInitialState: createGomokuState,
  getLegalMoves: getLegalGomokuMoves,
  applyMove: playGomokuMove,
  serialize: serializeGomokuState,
  deserialize: deserializeGomokuState,
}
