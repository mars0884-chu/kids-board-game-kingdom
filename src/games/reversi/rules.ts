import type { TurnGamePhase, TurnGameRules } from '../core/turn-game'

export type ReversiPlayer = 'black' | 'white'
export type ReversiCell = ReversiPlayer | null
export type ReversiMove = number

export interface ReversiMoveRecord {
  readonly kind: 'move'
  readonly player: ReversiPlayer
  readonly move: ReversiMove
}

export interface ReversiPassRecord {
  readonly kind: 'pass'
  readonly player: ReversiPlayer
}

export type ReversiTurnRecord = ReversiMoveRecord | ReversiPassRecord

export const REVERSI_BOARD_SIZE = 8
export const REVERSI_BOARD_CELLS = REVERSI_BOARD_SIZE * REVERSI_BOARD_SIZE

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
]

export interface ReversiState {
  readonly version: 1
  readonly boardSize: 8
  readonly startingPlayer: 'black'
  readonly board: readonly ReversiCell[]
  readonly currentPlayer: ReversiPlayer
  readonly phase: TurnGamePhase
  readonly winner: ReversiPlayer | null
  readonly blackCount: number
  readonly whiteCount: number
  readonly consecutivePasses: number
  readonly turns: readonly ReversiTurnRecord[]
}

export interface ReversiGameResult {
  readonly phase: TurnGamePhase
  readonly winner: ReversiPlayer | null
  readonly blackCount: number
  readonly whiteCount: number
}

function otherPlayer(player: ReversiPlayer): ReversiPlayer {
  return player === 'black' ? 'white' : 'black'
}

function isPlayer(value: unknown): value is ReversiPlayer {
  return value === 'black' || value === 'white'
}

function isMove(value: unknown): value is ReversiMove {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < REVERSI_BOARD_CELLS
}

function toRowColumn(move: ReversiMove): readonly [number, number] {
  return [Math.floor(move / REVERSI_BOARD_SIZE), move % REVERSI_BOARD_SIZE]
}

function toMove(row: number, column: number): ReversiMove {
  return row * REVERSI_BOARD_SIZE + column
}

function inBounds(row: number, column: number): boolean {
  return row >= 0 && row < REVERSI_BOARD_SIZE && column >= 0 && column < REVERSI_BOARD_SIZE
}

function countPieces(board: readonly ReversiCell[]): Pick<ReversiGameResult, 'blackCount' | 'whiteCount'> {
  return board.reduce((counts, cell) => ({
    blackCount: counts.blackCount + (cell === 'black' ? 1 : 0),
    whiteCount: counts.whiteCount + (cell === 'white' ? 1 : 0),
  }), { blackCount: 0, whiteCount: 0 })
}

function calculateFlips(board: readonly ReversiCell[], player: ReversiPlayer, move: ReversiMove): readonly ReversiMove[] {
  if (!isMove(move) || board[move] !== null) return []

  const opponent = otherPlayer(player)
  const [row, column] = toRowColumn(move)
  const flips: ReversiMove[] = []

  for (const [rowStep, columnStep] of DIRECTIONS) {
    const directionFlips: ReversiMove[] = []
    let nextRow = row + rowStep
    let nextColumn = column + columnStep

    while (inBounds(nextRow, nextColumn) && board[toMove(nextRow, nextColumn)] === opponent) {
      directionFlips.push(toMove(nextRow, nextColumn))
      nextRow += rowStep
      nextColumn += columnStep
    }

    if (directionFlips.length > 0 && inBounds(nextRow, nextColumn) && board[toMove(nextRow, nextColumn)] === player) {
      flips.push(...directionFlips)
    }
  }

  return flips
}

function resultFor(board: readonly ReversiCell[], consecutivePasses: number): ReversiGameResult {
  const counts = countPieces(board)
  if (board.some((cell) => cell === null) && consecutivePasses < 2) {
    return { phase: 'playing', winner: null, ...counts }
  }
  if (counts.blackCount === counts.whiteCount) return { phase: 'draw', winner: null, ...counts }
  return {
    phase: 'won',
    winner: counts.blackCount > counts.whiteCount ? 'black' : 'white',
    ...counts,
  }
}

function withResult(state: Omit<ReversiState, 'phase' | 'winner' | 'blackCount' | 'whiteCount'>): ReversiState {
  const result = resultFor(state.board, state.consecutivePasses)
  return { ...state, ...result }
}

export function createReversiState(): ReversiState {
  const board = Array<ReversiCell>(REVERSI_BOARD_CELLS).fill(null)
  board[27] = 'white'
  board[36] = 'white'
  board[28] = 'black'
  board[35] = 'black'
  return withResult({
    version: 1,
    boardSize: REVERSI_BOARD_SIZE,
    startingPlayer: 'black',
    board,
    currentPlayer: 'black',
    consecutivePasses: 0,
    turns: [],
  })
}

export function getFlips(state: ReversiState, move: ReversiMove): readonly ReversiMove[] {
  if (state.phase !== 'playing') return []
  return calculateFlips(state.board, state.currentPlayer, move)
}

export function getLegalReversiMoves(state: ReversiState): readonly ReversiMove[] {
  if (state.phase !== 'playing') return []
  return state.board.flatMap((cell, move) => cell === null && getFlips(state, move).length > 0 ? [move] : [])
}

export function mustPass(state: ReversiState): boolean {
  return state.phase === 'playing' && getLegalReversiMoves(state).length === 0
}

export function getGameResult(state: ReversiState): ReversiGameResult {
  return resultFor(state.board, state.consecutivePasses)
}

/** 將規則必然發生的略過寫入紀錄；畫面不可自行發出略過指令。 */
export function resolveForcedPasses(state: ReversiState): ReversiState {
  let next = withResult({
    version: state.version,
    boardSize: state.boardSize,
    startingPlayer: state.startingPlayer,
    board: state.board,
    currentPlayer: state.currentPlayer,
    consecutivePasses: state.consecutivePasses,
    turns: state.turns,
  })

  while (next.phase === 'playing' && mustPass(next)) {
    next = withResult({
      version: next.version,
      boardSize: next.boardSize,
      startingPlayer: next.startingPlayer,
      board: next.board,
      currentPlayer: otherPlayer(next.currentPlayer),
      consecutivePasses: next.consecutivePasses + 1,
      turns: [...next.turns, { kind: 'pass', player: next.currentPlayer }],
    })
  }

  return next
}

export function applyReversiMove(state: ReversiState, move: ReversiMove): ReversiState {
  if (!isMove(move)) throw new Error('黑白棋位置必須是 0 到 63 的整數。')
  if (state.phase !== 'playing') throw new Error('對局已經結束，不能繼續落子。')
  if (state.board[move] !== null) throw new Error('這一格已經有棋子。')

  const flips = getFlips(state, move)
  if (flips.length === 0) throw new Error('這一格不能包住對方棋子，不能落子。')

  const board = [...state.board]
  board[move] = state.currentPlayer
  for (const flippedMove of flips) board[flippedMove] = state.currentPlayer

  const next = withResult({
    version: state.version,
    boardSize: state.boardSize,
    startingPlayer: state.startingPlayer,
    board,
    currentPlayer: otherPlayer(state.currentPlayer),
    consecutivePasses: 0,
    turns: [...state.turns, { kind: 'move', player: state.currentPlayer, move }],
  })

  return next.phase === 'playing' ? resolveForcedPasses(next) : next
}

export function replayReversiMoves(moves: readonly ReversiMove[]): ReversiState {
  return moves.reduce(applyReversiMove, createReversiState())
}

function isTurnRecord(value: unknown): value is ReversiTurnRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (record.kind === 'move' && isPlayer(record.player) && isMove(record.move)) ||
    (record.kind === 'pass' && isPlayer(record.player))
}

function sameTurns(left: readonly ReversiTurnRecord[], right: readonly ReversiTurnRecord[]): boolean {
  return left.length === right.length && left.every((record, index) => {
    const candidate = right[index]
    return candidate !== undefined && record.kind === candidate.kind && record.player === candidate.player &&
      (record.kind === 'pass' || (candidate.kind === 'move' && record.move === candidate.move))
  })
}

export function replayReversiTurns(turns: readonly ReversiTurnRecord[]): ReversiState {
  if (!turns.every(isTurnRecord)) throw new Error('黑白棋回合紀錄格式不正確。')
  const state = replayReversiMoves(turns.flatMap((turn) => turn.kind === 'move' ? [turn.move] : []))
  if (!sameTurns(state.turns, turns)) throw new Error('黑白棋略過或走棋紀錄與規則不一致。')
  return state
}

export function serializeReversiState(state: ReversiState): string {
  return JSON.stringify(state)
}

function sameBoard(left: readonly ReversiCell[], right: unknown): boolean {
  return Array.isArray(right) && right.length === REVERSI_BOARD_CELLS && right.every((cell, index) =>
    (cell === null || isPlayer(cell)) && cell === left[index],
  )
}

export function deserializeReversiState(serialized: string): ReversiState {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('黑白棋存檔不是有效的 JSON。')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('黑白棋存檔格式不正確。')
  }

  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || candidate.boardSize !== REVERSI_BOARD_SIZE || candidate.startingPlayer !== 'black' || !Array.isArray(candidate.turns)) {
    throw new Error('黑白棋存檔版本、棋盤尺寸、先手或回合紀錄不正確。')
  }

  let replayed: ReversiState
  try {
    replayed = replayReversiTurns(candidate.turns)
  } catch {
    throw new Error('黑白棋回合紀錄包含不合法步驟。')
  }

  const valid = sameBoard(replayed.board, candidate.board) &&
    candidate.currentPlayer === replayed.currentPlayer &&
    candidate.phase === replayed.phase &&
    candidate.winner === replayed.winner &&
    candidate.blackCount === replayed.blackCount &&
    candidate.whiteCount === replayed.whiteCount &&
    candidate.consecutivePasses === replayed.consecutivePasses &&
    sameTurns(replayed.turns, candidate.turns)

  if (!valid) throw new Error('黑白棋存檔內容與回合紀錄不一致。')
  return replayed
}

export const reversiRules: TurnGameRules<ReversiState, ReversiMove> = {
  createInitialState: createReversiState,
  getLegalMoves: getLegalReversiMoves,
  applyMove: applyReversiMove,
  serialize: serializeReversiState,
  deserialize: deserializeReversiState,
}
