import type { TurnGamePhase, TurnGameRules, TurnMoveRecord } from '../core/turn-game'

export type TicTacToePlayer = 'x' | 'o'
export type TicTacToeCell = TicTacToePlayer | null
export type TicTacToeMove = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type TicTacToeWinningLine = readonly [TicTacToeMove, TicTacToeMove, TicTacToeMove]
export type TicTacToeMoveRecord = TurnMoveRecord<TicTacToePlayer, TicTacToeMove>

export interface TicTacToeState {
  readonly version: 1
  readonly startingPlayer: TicTacToePlayer
  readonly board: readonly TicTacToeCell[]
  readonly currentPlayer: TicTacToePlayer
  readonly phase: TurnGamePhase
  readonly winner: TicTacToePlayer | null
  readonly winningLine: TicTacToeWinningLine | null
  readonly moves: readonly TicTacToeMoveRecord[]
}

export const TIC_TAC_TOE_WINNING_LINES: readonly TicTacToeWinningLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

const ALL_MOVES: readonly TicTacToeMove[] = [0, 1, 2, 3, 4, 5, 6, 7, 8]

function otherPlayer(player: TicTacToePlayer): TicTacToePlayer {
  return player === 'x' ? 'o' : 'x'
}

function isPlayer(value: unknown): value is TicTacToePlayer {
  return value === 'x' || value === 'o'
}

function isMove(value: unknown): value is TicTacToeMove {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 8
}

export function evaluateTicTacToeBoard(board: readonly TicTacToeCell[]): {
  phase: TurnGamePhase
  winner: TicTacToePlayer | null
  winningLine: TicTacToeWinningLine | null
} {
  if (board.length !== 9) {
    throw new Error('井字棋棋盤必須剛好有 9 格。')
  }

  for (const line of TIC_TAC_TOE_WINNING_LINES) {
    const [first, second, third] = line
    const player = board[first]
    if (player !== null && player === board[second] && player === board[third]) {
      return { phase: 'won', winner: player, winningLine: line }
    }
  }

  if (board.every((cell) => cell !== null)) {
    return { phase: 'draw', winner: null, winningLine: null }
  }

  return { phase: 'playing', winner: null, winningLine: null }
}

export function createTicTacToeState(startingPlayer: TicTacToePlayer = 'x'): TicTacToeState {
  return {
    version: 1,
    startingPlayer,
    board: Array<TicTacToeCell>(9).fill(null),
    currentPlayer: startingPlayer,
    phase: 'playing',
    winner: null,
    winningLine: null,
    moves: [],
  }
}

export function getLegalTicTacToeMoves(state: TicTacToeState): readonly TicTacToeMove[] {
  if (state.phase !== 'playing') {
    return []
  }

  return ALL_MOVES.filter((move) => state.board[move] === null)
}

export function playTicTacToeMove(state: TicTacToeState, move: TicTacToeMove): TicTacToeState {
  if (!isMove(move)) {
    throw new Error('井字棋位置必須是 0 到 8 的整數。')
  }
  if (state.phase !== 'playing') {
    throw new Error('對局已經結束，不能繼續落子。')
  }
  if (state.board[move] !== null) {
    throw new Error('這一格已經有棋子。')
  }

  const board = [...state.board]
  board[move] = state.currentPlayer
  const result = evaluateTicTacToeBoard(board)

  return {
    ...state,
    board,
    currentPlayer: otherPlayer(state.currentPlayer),
    phase: result.phase,
    winner: result.winner,
    winningLine: result.winningLine,
    moves: [...state.moves, { player: state.currentPlayer, move }],
  }
}

export function replayTicTacToeMoves(
  moves: readonly TicTacToeMove[],
  startingPlayer: TicTacToePlayer = 'x',
): TicTacToeState {
  return moves.reduce(playTicTacToeMove, createTicTacToeState(startingPlayer))
}

export function serializeTicTacToeState(state: TicTacToeState): string {
  return JSON.stringify(state)
}

function sameBoard(left: readonly TicTacToeCell[], right: unknown): boolean {
  return Array.isArray(right) &&
    right.length === 9 &&
    right.every((cell, index) => (cell === null || isPlayer(cell)) && cell === left[index])
}

function sameWinningLine(left: TicTacToeWinningLine | null, right: unknown): boolean {
  if (left === null) {
    return right === null
  }
  return Array.isArray(right) && right.length === 3 && right.every((move, index) => move === left[index])
}

export function deserializeTicTacToeState(serialized: string): TicTacToeState {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('井字棋存檔不是有效的 JSON。')
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('井字棋存檔格式不正確。')
  }

  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || !isPlayer(candidate.startingPlayer) || !Array.isArray(candidate.moves)) {
    throw new Error('井字棋存檔版本、先手或走棋紀錄不正確。')
  }

  const moves: TicTacToeMove[] = []
  for (const [index, record] of candidate.moves.entries()) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      throw new Error('井字棋走棋紀錄格式不正確。')
    }
    const moveRecord = record as Record<string, unknown>
    const expectedPlayer = index % 2 === 0 ? candidate.startingPlayer : otherPlayer(candidate.startingPlayer)
    if (moveRecord.player !== expectedPlayer || !isMove(moveRecord.move)) {
      throw new Error('井字棋走棋順序或位置不正確。')
    }
    moves.push(moveRecord.move)
  }

  let replayed: TicTacToeState
  try {
    replayed = replayTicTacToeMoves(moves, candidate.startingPlayer)
  } catch {
    throw new Error('井字棋走棋紀錄包含不合法步驟。')
  }

  const valid = sameBoard(replayed.board, candidate.board) &&
    candidate.currentPlayer === replayed.currentPlayer &&
    candidate.phase === replayed.phase &&
    candidate.winner === replayed.winner &&
    sameWinningLine(replayed.winningLine, candidate.winningLine)

  if (!valid) {
    throw new Error('井字棋存檔內容與走棋紀錄不一致。')
  }

  return replayed
}

export const ticTacToeRules: TurnGameRules<TicTacToeState, TicTacToeMove> = {
  createInitialState: createTicTacToeState,
  getLegalMoves: getLegalTicTacToeMoves,
  applyMove: playTicTacToeMove,
  serialize: serializeTicTacToeState,
  deserialize: deserializeTicTacToeState,
}
