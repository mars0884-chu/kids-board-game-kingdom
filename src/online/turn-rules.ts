import { createAnimalChessState, getLegalAnimalChessMoves, applyAnimalChessMove, serializeAnimalChessState, deserializeAnimalChessState, type AnimalChessState } from '../games/animal-chess/rules'
import { createGomokuState, getLegalGomokuMoves, playGomokuMove, serializeGomokuState, deserializeGomokuState, type GomokuState } from '../games/gomoku/rules'
import { createReversiState, getLegalReversiMoves, applyReversiMove, serializeReversiState, deserializeReversiState, type ReversiState } from '../games/reversi/rules'
import { createTicTacToeState, getLegalTicTacToeMoves, playTicTacToeMove, serializeTicTacToeState, deserializeTicTacToeState, type TicTacToeState } from '../games/tic-tac-toe/rules'

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
