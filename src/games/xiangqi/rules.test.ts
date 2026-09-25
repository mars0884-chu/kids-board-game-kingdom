import { describe, expect, it } from 'vitest'
import {
  XIANGQI_BOARD_CELLS,
  agreeDraw,
  applyMove,
  createInitialXiangqiState,
  getLegalMovesFrom,
  isInCheck,
  isInsufficientMatingMaterial,
  positionKey,
  type XiangqiCell,
  type XiangqiKind,
  type XiangqiPlayer,
  type XiangqiState,
} from './rules'

function cell(row: number, column: number): number {
  return row * 9 + column
}

function makeState(
  placements: readonly { owner: XiangqiPlayer; kind: XiangqiKind; row: number; column: number }[],
  currentPlayer: XiangqiPlayer = 'red',
): XiangqiState {
  const board: XiangqiCell[] = Array.from({ length: XIANGQI_BOARD_CELLS }, () => null)
  placements.forEach((placement, index) => {
    const piece = { ...placement, id: `${placement.owner}-${placement.kind}-${index + 1}` }
    const target = cell(placement.row, placement.column)
    if (board[target] !== null) throw new Error('測試局面有重疊棋子。')
    board[target] = piece
  })
  const base: XiangqiState = {
    version: 1,
    boardWidth: 9,
    boardHeight: 10,
    board,
    currentPlayer,
    phase: 'playing',
    winner: null,
    drawReason: null,
    options: { repetitionLimit: null },
    positionHistory: [],
    repetitionCounts: {},
    turns: [],
  }
  const key = positionKey(base)
  return { ...base, positionHistory: [key], repetitionCounts: { [key]: 1 } }
}

function terminalFixture(check: boolean): XiangqiState {
  const blockers = [
    [0, 3], [0, 5], [1, 3], [1, 5],
  ] as const
  const protectors = [
    [0, 2], [0, 6], [2, 3], [2, 5],
  ] as const
  return makeState([
    { owner: 'black', kind: 'king', row: 0, column: 4 },
    { owner: 'red', kind: 'king', row: 9, column: 0 },
    { owner: 'red', kind: 'soldier', row: 6, column: 0 },
    ...blockers.map(([row, column]) => ({ owner: 'red' as const, kind: 'chariot' as const, row, column })),
    ...protectors.map(([row, column]) => ({ owner: 'red' as const, kind: 'chariot' as const, row, column })),
    ...(check ? [{ owner: 'red' as const, kind: 'chariot' as const, row: 2, column: 4 }] : []),
  ])
}

describe('象棋規則核心', () => {
  it('建立標準 9 路 10 線局面，紅方先走', () => {
    const state = createInitialXiangqiState()
    const pieces = state.board.filter((piece) => piece !== null)

    expect(state.currentPlayer).toBe('red')
    expect(pieces).toHaveLength(32)
    expect(state.board[cell(9, 4)]?.kind).toBe('king')
    expect(state.board[cell(0, 4)]?.kind).toBe('king')
    expect(state.board[cell(7, 1)]?.kind).toBe('cannon')
    expect(state.board[cell(2, 7)]?.kind).toBe('cannon')
    expect(state.board[cell(6, 8)]?.kind).toBe('soldier')
  })

  it('套用馬腿、象眼、炮架、兵過河與九宮限制', () => {
    const horse = makeState([
      { owner: 'red', kind: 'king', row: 9, column: 4 },
      { owner: 'black', kind: 'king', row: 0, column: 3 },
      { owner: 'red', kind: 'horse', row: 5, column: 4 },
      { owner: 'red', kind: 'soldier', row: 4, column: 4 },
    ])
    expect(getLegalMovesFrom(horse, cell(5, 4))).not.toContainEqual(expect.objectContaining({ to: cell(3, 3) }))

    const elephant = makeState([
      { owner: 'red', kind: 'king', row: 9, column: 4 },
      { owner: 'black', kind: 'king', row: 0, column: 3 },
      { owner: 'red', kind: 'elephant', row: 5, column: 2 },
      { owner: 'red', kind: 'soldier', row: 4, column: 1 },
    ])
    expect(getLegalMovesFrom(elephant, cell(5, 2))).not.toContainEqual(expect.objectContaining({ to: cell(3, 0) }))

    const cannon = makeState([
      { owner: 'red', kind: 'king', row: 9, column: 4 },
      { owner: 'black', kind: 'king', row: 0, column: 3 },
      { owner: 'red', kind: 'cannon', row: 5, column: 0 },
      { owner: 'black', kind: 'soldier', row: 5, column: 2 },
      { owner: 'black', kind: 'chariot', row: 5, column: 3 },
    ])
    expect(getLegalMovesFrom(cannon, cell(5, 0))).toContainEqual(expect.objectContaining({ to: cell(5, 3) }))
    expect(getLegalMovesFrom(cannon, cell(5, 0))).not.toContainEqual(expect.objectContaining({ to: cell(5, 4) }))

    const soldier = makeState([
      { owner: 'red', kind: 'king', row: 9, column: 4 },
      { owner: 'black', kind: 'king', row: 0, column: 3 },
      { owner: 'red', kind: 'soldier', row: 4, column: 4 },
    ])
    const soldierTargets = getLegalMovesFrom(soldier, cell(4, 4)).map((move) => move.to)
    expect(soldierTargets).toEqual(expect.arrayContaining([cell(3, 4), cell(4, 3), cell(4, 5)]))

    const king = makeState([
      { owner: 'red', kind: 'king', row: 9, column: 4 },
      { owner: 'black', kind: 'king', row: 0, column: 0 },
    ])
    expect(getLegalMovesFrom(king, cell(9, 4)).map((move) => move.to)).toEqual(
      expect.arrayContaining([cell(8, 4), cell(9, 3), cell(9, 5)]),
    )
    expect(getLegalMovesFrom(king, cell(9, 4))).not.toContainEqual(expect.objectContaining({ to: cell(7, 4) }))
  })

  it('遵守飛將與不能讓自己的帥留在將軍線上的限制', () => {
    const flyingGeneral = makeState([
      { owner: 'red', kind: 'king', row: 9, column: 4 },
      { owner: 'black', kind: 'king', row: 0, column: 4 },
    ])
    expect(isInCheck(flyingGeneral, 'red')).toBe(true)
    expect(isInCheck(flyingGeneral, 'black')).toBe(true)


    const selfCheck = makeState([
      { owner: 'red', kind: 'king', row: 9, column: 4 },
      { owner: 'black', kind: 'king', row: 0, column: 3 },
      { owner: 'black', kind: 'chariot', row: 0, column: 4 },
      { owner: 'red', kind: 'soldier', row: 4, column: 4 },
    ])
    expect(getLegalMovesFrom(selfCheck, cell(4, 4))).not.toContainEqual(expect.objectContaining({ to: cell(4, 3) }))
  })

  it('不允許直接吃掉帥，將死時由對方獲勝', () => {
    const checkmate = terminalFixture(true)
    expect(getLegalMovesFrom(checkmate, cell(2, 4))).not.toContainEqual(expect.objectContaining({ to: cell(0, 4) }))

    const next = applyMove(checkmate, cell(6, 0), cell(5, 0))
    expect(next.phase).toBe('won')
    expect(next.winner).toBe('red')
    expect(next.drawReason).toBeNull()
  })

  it('困斃同樣判負，且雙方沒有可將死的子力時判和', () => {
    const stalemate = terminalFixture(false)
    const next = applyMove(stalemate, cell(6, 0), cell(5, 0))
    expect(next.phase).toBe('won')
    expect(next.winner).toBe('red')

    const bareKings = makeState([
      { owner: 'red', kind: 'king', row: 9, column: 4 },
      { owner: 'black', kind: 'king', row: 0, column: 3 },
    ])
    expect(isInsufficientMatingMaterial(bareKings)).toBe(true)
    const moved = applyMove(
      makeState([
        { owner: 'red', kind: 'king', row: 9, column: 4 },
        { owner: 'black', kind: 'king', row: 0, column: 3 },
        { owner: 'red', kind: 'advisor', row: 8, column: 3 },
      ]),
      cell(8, 3),
      cell(7, 4),
    )
    expect(moved.phase).toBe('draw')
    expect(moved.drawReason).toBe('insufficient-material')

    const agreement = agreeDraw(createInitialXiangqiState())
    expect(agreement.phase).toBe('draw')
    expect(agreement.drawReason).toBe('mutual-agreement')

    const tracked = createInitialXiangqiState({ repetitionLimit: 3 })
    const initialKey = positionKey(tracked)
    expect(tracked.positionHistory).toEqual([initialKey])
    expect(tracked.repetitionCounts[initialKey]).toBe(1)
  })
})
