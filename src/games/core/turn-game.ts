export type TurnGamePhase = 'playing' | 'won' | 'draw'

export interface TurnMoveRecord<Player, Move> {
  readonly player: Player
  readonly move: Move
}

export interface TurnGameRules<State, Move> {
  createInitialState(): State
  getLegalMoves(state: State): readonly Move[]
  applyMove(state: State, move: Move): State
  serialize(state: State): string
  deserialize(serialized: string): State
}
