import { describe, expect, it } from 'vitest'
import {
  ANIMAL_CHESS_BOARD_CELLS,
  ANIMAL_CHESS_BOARD_HEIGHT,
  ANIMAL_CHESS_BOARD_WIDTH,
  ANIMAL_CHESS_QUIET_ROUNDS,
  applyAnimalChessMove,
  createAnimalChessState,
  createAnimalChessTutorialState,
  deserializeAnimalChessState,
  getAnimalDenOwner,
  getAnimalPieceAt,
  getAnimalTrapOwner,
  getLegalAnimalChessMoves,
  isAnimalRiverCell,
  serializeAnimalChessState,
  type AnimalChessState,
  type AnimalKind,
  type AnimalPiece,
  type AnimalPlayer,
} from './rules'

const at = (row: number, column: number) => row * ANIMAL_CHESS_BOARD_WIDTH + column

function customState(placed: Array<{ owner: AnimalPlayer; kind: AnimalKind; row: number; column: number }>, currentPlayer: AnimalPlayer = 'player1', quietRounds = 0): AnimalChessState {
  const placedPieces: AnimalPiece[] = placed.map((piece, index) => ({
    id: `${piece.owner}-${piece.kind}-${index}`,
    ...piece,
    captured: false,
  }))
  const capturedPieces: AnimalPiece[] = Array.from({ length: 16 - placedPieces.length }, (_, index) => ({
    id: `captured-${index}`,
    owner: index % 2 === 0 ? 'player1' : 'player2',
    kind: 'mouse',
    row: -1,
    column: -1,
    captured: true,
  }))
  const pieces = [...placedPieces, ...capturedPieces]
  const board = Array.from({ length: ANIMAL_CHESS_BOARD_CELLS }, () => null as string | null)
  for (const piece of placedPieces) board[at(piece.row, piece.column)] = piece.id
  return {
    version: 1,
    boardWidth: ANIMAL_CHESS_BOARD_WIDTH,
    boardHeight: ANIMAL_CHESS_BOARD_HEIGHT,
    seed: 123,
    board,
    pieces,
    currentPlayer,
    phase: 'playing',
    winner: null,
    drawReason: null,
    quietRounds,
    positionHistory: ['test'],
    turns: [],
  }
}

describe('動物棋規則核心', () => {
  it('建立 7×9 棋盤、16 枚棋子、兩段 2×3 小河、獸穴與陷阱', () => {
    const state = createAnimalChessState()
    expect(state.board).toHaveLength(ANIMAL_CHESS_BOARD_CELLS)
    expect(state.pieces.filter((piece) => !piece.captured)).toHaveLength(16)
    expect(Array.from({ length: ANIMAL_CHESS_BOARD_CELLS }, (_, cell) => isAnimalRiverCell(cell)).filter(Boolean)).toHaveLength(12)
    expect(getAnimalDenOwner(at(0, 3))).toBe('player2')
    expect(getAnimalDenOwner(at(8, 3))).toBe('player1')
    expect([2, 3, 4].map((column) => getAnimalTrapOwner(at(1, column)))).toEqual(['player2', 'player2', 'player2'])
    expect([2, 3, 4].map((column) => getAnimalTrapOwner(at(7, column)))).toEqual(['player1', 'player1', 'player1'])
  })

  it('只允許上下左右一步，鼠可以走進小河', () => {
    const state = createAnimalChessState()
    const moves = getLegalAnimalChessMoves(state)
    expect(moves).toContainEqual({ from: at(8, 6), to: at(8, 5) })
    expect(moves).not.toContainEqual({ from: at(8, 6), to: at(7, 5) })
    expect(moves).toContainEqual({ from: at(6, 0), to: at(6, 1) })
  })

  it('獅與虎可以跳河，河中有鼠時會被阻擋', () => {
    const state = customState([{ owner: 'player1', kind: 'lion', row: 2, column: 1 }])
    expect(getLegalAnimalChessMoves(state)).toContainEqual({ from: at(2, 1), to: at(6, 1) })
    const blocked = customState([
      { owner: 'player1', kind: 'lion', row: 2, column: 1 },
      { owner: 'player2', kind: 'mouse', row: 4, column: 1 },
    ])
    expect(getLegalAnimalChessMoves(blocked)).not.toContainEqual({ from: at(2, 1), to: at(6, 1) })
  })

  it('老鼠可以吃象，但象不能反吃老鼠；陷阱中的敵方棋子可被任何己方動物吃掉', () => {
    const mouse = customState([
      { owner: 'player1', kind: 'mouse', row: 2, column: 1 },
      { owner: 'player2', kind: 'elephant', row: 2, column: 2 },
    ])
    expect(getLegalAnimalChessMoves(mouse)).toContainEqual({ from: at(2, 1), to: at(2, 2) })

    const elephant = customState([
      { owner: 'player1', kind: 'elephant', row: 2, column: 1 },
      { owner: 'player2', kind: 'mouse', row: 2, column: 2 },
    ])
    expect(getLegalAnimalChessMoves(elephant)).not.toContainEqual({ from: at(2, 1), to: at(2, 2) })

    const trap = customState([
      { owner: 'player1', kind: 'cat', row: 7, column: 1 },
      { owner: 'player2', kind: 'elephant', row: 7, column: 2 },
    ])
    expect(getLegalAnimalChessMoves(trap)).toContainEqual({ from: at(7, 1), to: at(7, 2) })
  })

  it('走進對方獸穴或吃完對方棋子會獲勝，安靜回合滿 50 回合會和局', () => {
    const den = customState([{ owner: 'player1', kind: 'lion', row: 1, column: 3 }])
    const won = applyAnimalChessMove(den, { from: at(1, 3), to: at(0, 3) })
    expect(won.phase).toBe('won')
    expect(won.winner).toBe('player1')

    const quiet = customState([
      { owner: 'player1', kind: 'cat', row: 2, column: 0 },
      { owner: 'player2', kind: 'cat', row: 6, column: 0 },
    ], 'player2', ANIMAL_CHESS_QUIET_ROUNDS - 1)
    const draw = applyAnimalChessMove(quiet, { from: at(6, 0), to: at(6, 1) })
    expect(draw.phase).toBe('draw')
    expect(draw.drawReason).toBe('quiet-50-rounds')
  })

  it('序列化後可重播局面並拒絕不一致內容', () => {
    const initial = createAnimalChessState()
    const move = getLegalAnimalChessMoves(initial)[0]!
    const next = applyAnimalChessMove(initial, move)
    expect(deserializeAnimalChessState(serializeAnimalChessState(next))).toEqual(next)
    expect(() => deserializeAnimalChessState(serializeAnimalChessState(next).replace('"quietRounds":0', '"quietRounds":7'))).toThrow('重播不一致')
  })

  it('六個教學固定局面可使用同一規則核心移動並重播存檔', () => {
    const tutorialMoves = [
      { from: at(4, 3), to: at(3, 3) },
      { from: at(4, 3), to: at(3, 3) },
      { from: at(4, 3), to: at(4, 4) },
      { from: at(2, 1), to: at(3, 1) },
      { from: at(2, 4), to: at(6, 4) },
      { from: at(7, 2), to: at(7, 3) },
    ] as const

    for (const [step, move] of tutorialMoves.entries()) {
      const state = createAnimalChessTutorialState(step as 0 | 1 | 2 | 3 | 4 | 5)
      const next = applyAnimalChessMove(state, move)
      expect(next.setup).toBe(`tutorial-${step + 1}`)
      expect(deserializeAnimalChessState(serializeAnimalChessState(next))).toEqual(next)
    }
  })

  it('尺寸常數與棋子定位可以供畫面維持正方格', () => {
    expect(ANIMAL_CHESS_BOARD_WIDTH).toBe(7)
    expect(ANIMAL_CHESS_BOARD_HEIGHT).toBe(9)
    expect(getAnimalPieceAt(createAnimalChessState(), at(8, 6))?.kind).toBe('lion')
    expect(getAnimalPieceAt(createAnimalChessState(), at(8, 6))?.owner).toBe('player1')
    expect(getAnimalPieceAt(createAnimalChessState(), at(0, 0))?.owner).toBe('player2')
  })
})
