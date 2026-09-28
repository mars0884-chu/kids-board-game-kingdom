import { createAnimalChessState, getLegalAnimalChessMoves, applyAnimalChessMove, serializeAnimalChessState, deserializeAnimalChessState, type AnimalChessState } from '../games/animal-chess/rules'
import { createGomokuState, getLegalGomokuMoves, playGomokuMove, serializeGomokuState, deserializeGomokuState, type GomokuState } from '../games/gomoku/rules'
import { createReversiState, getLegalReversiMoves, applyReversiMove, serializeReversiState, deserializeReversiState, type ReversiState } from '../games/reversi/rules'
import { createTicTacToeState, getLegalTicTacToeMoves, playTicTacToeMove, serializeTicTacToeState, deserializeTicTacToeState, type TicTacToeState } from '../games/tic-tac-toe/rules'
import { applyMove as applyXiangqiMove, createInitialXiangqiState, getLegalMoves as getLegalXiangqiMoves, serializeXiangqiState, deserializeXiangqiState, type XiangqiState } from '../games/xiangqi/rules'
import { applyGoAction, createGoState, deserializeGoState, serializeGoState, type GoBoardSize, type GoState } from '../games/go/rules'

export interface OnlineTurnRules<State> {
  initial(): State
  serialize(state: State): string
  deserialize(serialized: string): State
  currentRole(state: State): 'host' | 'guest'
  isLegalStep(before: State, next: State): boolean
}

function matchesOneStep<State, Move>(
  before: State,
  next: State,
  moves: readonly Move[],
  apply: (state: State, move: Move) => State,
  serialize: (state: State) => string,
): boolean {
  const target = serialize(next)
  return moves.some((move) => serialize(apply(before, move)) === target)
}

/** 四款棋類僅接受規則核心重算得出的下一局面，不接受對端任意覆寫。 */
export const animalChessOnlineRules: OnlineTurnRules<AnimalChessState> = {
  initial: createAnimalChessState,
  serialize: serializeAnimalChessState,
  deserialize: deserializeAnimalChessState,
  currentRole: (state) => state.currentPlayer === 'player1' ? 'host' : 'guest',
  isLegalStep: (before, next) => before.phase === 'playing' && before.setup === undefined &&
    matchesOneStep(before, next, getLegalAnimalChessMoves(before), applyAnimalChessMove, serializeAnimalChessState),
}

export const gomokuOnlineRules: OnlineTurnRules<GomokuState> = {
  initial: createGomokuState,
  serialize: serializeGomokuState,
  deserialize: deserializeGomokuState,
  currentRole: (state) => state.currentPlayer === 'black' ? 'host' : 'guest',
  isLegalStep: (before, next) => before.phase === 'playing' &&
    matchesOneStep(before, next, getLegalGomokuMoves(before), playGomokuMove, serializeGomokuState),
}

export const reversiOnlineRules: OnlineTurnRules<ReversiState> = {
  initial: createReversiState,
  serialize: serializeReversiState,
  deserialize: deserializeReversiState,
  currentRole: (state) => state.currentPlayer === 'black' ? 'host' : 'guest',
  isLegalStep: (before, next) => before.phase === 'playing' &&
    matchesOneStep(before, next, getLegalReversiMoves(before), applyReversiMove, serializeReversiState),
}

export const ticTacToeOnlineRules: OnlineTurnRules<TicTacToeState> = {
  initial: createTicTacToeState,
  serialize: serializeTicTacToeState,
  deserialize: deserializeTicTacToeState,
  currentRole: (state) => state.currentPlayer === 'x' ? 'host' : 'guest',
  isLegalStep: (before, next) => before.phase === 'playing' &&
    matchesOneStep(before, next, getLegalTicTacToeMoves(before), playTicTacToeMove, serializeTicTacToeState),
}

export const xiangqiOnlineRules: OnlineTurnRules<XiangqiState> = {
  initial: createInitialXiangqiState,
  serialize: serializeXiangqiState,
  deserialize: deserializeXiangqiState,
  currentRole: (state) => state.currentPlayer === 'red' ? 'host' : 'guest',
  isLegalStep: (before, next) => before.phase !== 'won' && before.phase !== 'draw' &&
    matchesOneStep(before, next, getLegalXiangqiMoves(before), (state, move) => applyXiangqiMove(state, move.from, move.to), serializeXiangqiState),
}

/** 每個路數使用獨立房間棋種；棋盤尺寸由可信 Worker 固定，不能由客戶端中途更換。 */
export function createGoOnlineRules(boardSize: GoBoardSize): OnlineTurnRules<GoState> {
  return {
    initial: () => createGoState(boardSize),
    serialize: serializeGoState,
    deserialize: (serialized) => {
      const state = deserializeGoState(serialized)
      if (state.boardSize !== boardSize) throw new Error('圍棋房間路數不一致。')
      return state
    },
    currentRole: (state) => state.currentPlayer === 'black' ? 'host' : 'guest',
    isLegalStep: (before, next) => {
      if (before.phase === 'finished' || before.boardSize !== boardSize || next.boardSize !== boardSize ||
        next.moves.length !== before.moves.length + 1 || next.moves.at(-1)?.player !== before.currentPlayer) return false
      try { return serializeGoState(applyGoAction(before, next.moves.at(-1)!.action)) === serializeGoState(next) }
      catch { return false }
    },
  }
}
