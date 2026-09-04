import {
  evaluateTicTacToeBoard,
  getLegalTicTacToeMoves,
  type TicTacToeCell,
  type TicTacToeMove,
  type TicTacToePlayer,
  type TicTacToeState,
} from './rules'

export type TicTacToeDifficulty = 'beginner' | 'growth' | 'challenge' | 'adult'

const POSITION_PRIORITY: readonly TicTacToeMove[] = [4, 0, 2, 6, 8, 1, 3, 5, 7]
const CORNERS: readonly TicTacToeMove[] = [0, 2, 6, 8]
const EDGES: readonly TicTacToeMove[] = [1, 3, 5, 7]

function otherPlayer(player: TicTacToePlayer): TicTacToePlayer {
  return player === 'x' ? 'o' : 'x'
}

function seededIndex(seed: number, length: number): number {
  let value = seed >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return (value >>> 0) % length
}

function chooseSeeded(moves: readonly TicTacToeMove[], seed: number): TicTacToeMove {
  return moves[seededIndex(seed, moves.length)] as TicTacToeMove
}

function availableByPriority(legalMoves: readonly TicTacToeMove[]): TicTacToeMove[] {
  const legal = new Set(legalMoves)
  return POSITION_PRIORITY.filter((move) => legal.has(move))
}

function findImmediateMove(
  board: readonly TicTacToeCell[],
  legalMoves: readonly TicTacToeMove[],
  player: TicTacToePlayer,
): TicTacToeMove | null {
  for (const move of availableByPriority(legalMoves)) {
    const nextBoard = [...board]
    nextBoard[move] = player
    if (evaluateTicTacToeBoard(nextBoard).winner === player) {
      return move
    }
  }
  return null
}

function minimax(
  board: readonly TicTacToeCell[],
  activePlayer: TicTacToePlayer,
  npcPlayer: TicTacToePlayer,
  depth: number,
): number {
  const result = evaluateTicTacToeBoard(board)
  if (result.phase === 'won') {
    return result.winner === npcPlayer ? 10 - depth : depth - 10
  }
  if (result.phase === 'draw') {
    return 0
  }

  const legalMoves = POSITION_PRIORITY.filter((move) => board[move] === null)
  const scores = legalMoves.map((move) => {
    const nextBoard = [...board]
    nextBoard[move] = activePlayer
    return minimax(nextBoard, otherPlayer(activePlayer), npcPlayer, depth + 1)
  })

  return activePlayer === npcPlayer ? Math.max(...scores) : Math.min(...scores)
}

function bestMoves(state: TicTacToeState): TicTacToeMove[] {
  const npcPlayer = state.currentPlayer
  const legalMoves = availableByPriority(getLegalTicTacToeMoves(state))
  const scored = legalMoves.map((move) => {
    const nextBoard = [...state.board]
    nextBoard[move] = npcPlayer
    return {
      move,
      score: minimax(nextBoard, otherPlayer(npcPlayer), npcPlayer, 1),
    }
  })
  const bestScore = Math.max(...scored.map(({ score }) => score))
  return scored.filter(({ score }) => score === bestScore).map(({ move }) => move)
}

function chooseBeginnerMove(state: TicTacToeState, seed: number): TicTacToeMove {
  const legalMoves = getLegalTicTacToeMoves(state)
  const winningMove = findImmediateMove(state.board, legalMoves, state.currentPlayer)
  if (winningMove !== null) {
    return winningMove
  }

  const blockingMove = findImmediateMove(state.board, legalMoves, otherPlayer(state.currentPlayer))
  if (blockingMove !== null && seededIndex(seed, 100) < 55) {
    return blockingMove
  }

  return chooseSeeded(availableByPriority(legalMoves), seed)
}

function chooseGrowthMove(state: TicTacToeState, seed: number): TicTacToeMove {
  const legalMoves = getLegalTicTacToeMoves(state)
  const winningMove = findImmediateMove(state.board, legalMoves, state.currentPlayer)
  if (winningMove !== null) {
    return winningMove
  }

  const blockingMove = findImmediateMove(state.board, legalMoves, otherPlayer(state.currentPlayer))
  if (blockingMove !== null) {
    return blockingMove
  }

  if (legalMoves.includes(4)) {
    return 4
  }
  const availableCorners = CORNERS.filter((move) => legalMoves.includes(move))
  if (availableCorners.length > 0) {
    return chooseSeeded(availableCorners, seed)
  }
  return chooseSeeded(EDGES.filter((move) => legalMoves.includes(move)), seed)
}

export function chooseTicTacToeMove(
  state: TicTacToeState,
  difficulty: TicTacToeDifficulty,
  seed: number,
): TicTacToeMove | null {
  if (!Number.isInteger(seed)) {
    throw new Error('井字棋 NPC 種子必須是整數。')
  }
  if (state.phase !== 'playing') {
    return null
  }

  switch (difficulty) {
    case 'beginner':
      return chooseBeginnerMove(state, seed)
    case 'growth':
      return chooseGrowthMove(state, seed)
    case 'challenge':
      return chooseSeeded(bestMoves(state), seed)
    case 'adult':
      return bestMoves(state)[0] as TicTacToeMove
  }
}
