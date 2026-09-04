import { describe, expect, it } from 'vitest'
import {
  REVERSI_BOARD_CELLS,
  REVERSI_BOARD_SIZE,
  applyReversiMove,
  createReversiState,
  deserializeReversiState,
  getFlips,
  getGameResult,
  getLegalReversiMoves,
  mustPass,
  replayReversiMoves,
  resolveForcedPasses,
  serializeReversiState,
  type ReversiCell,
  type ReversiPlayer,
  type ReversiState,
} from './rules'

const at = (row: number, column: number): number => row * REVERSI_BOARD_SIZE + column

function stateWith(board: readonly ReversiCell[], currentPlayer: ReversiPlayer, consecutivePasses = 0): ReversiState {
  const blackCount = board.filter((cell) => cell === 'black').length
  const whiteCount = board.filter((cell) => cell === 'white').length
  return {
    version: 1,
    boardSize: REVERSI_BOARD_SIZE,
    startingPlayer: 'black',
    board,
    currentPlayer,
    phase: 'playing',
    winner: null,
    blackCount,
    whiteCount,
    consecutivePasses,
    turns: [],
  }
}

describe('黑白棋規則核心', () => {
  it('新局為標準 8×8、黑方先手，並提供四個合法格', () => {
    const state = createReversiState()

    expect(state.board).toHaveLength(REVERSI_BOARD_CELLS)
    expect(state.currentPlayer).toBe('black')
    expect(state.blackCount).toBe(2)
    expect(state.whiteCount).toBe(2)
    expect(getLegalReversiMoves(state)).toEqual([19, 26, 37, 44])
  })

  it('會翻轉八個方向，且不跨越空格或棋盤外', () => {
    const center = at(3, 3)
    const board = Array<ReversiCell>(REVERSI_BOARD_CELLS).fill(null)
    for (const [rowStep, columnStep] of [
      [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1],
    ]) {
      board[at(3 + rowStep, 3 + columnStep)] = 'white'
      board[at(3 + rowStep * 2, 3 + columnStep * 2)] = 'black'
    }
    const state = stateWith(board, 'black')

    expect(getFlips(state, center)).toEqual([19, 20, 28, 36, 35, 34, 26, 18])
    expect(getFlips(state, at(0, 0))).toEqual([])
  })

  it('一次落子會翻轉所有被包住方向並交給對方', () => {
    const state = applyReversiMove(createReversiState(), 19)

    expect(state.board[19]).toBe('black')
    expect(state.board[27]).toBe('black')
    expect(state.blackCount).toBe(4)
    expect(state.whiteCount).toBe(1)
    expect(state.currentPlayer).toBe('white')
    expect(state.turns).toEqual([{ kind: 'move', player: 'black', move: 19 }])
  })

  it('拒絕範圍外、已占用、不能翻子與終局後操作', () => {
    const state = createReversiState()
    expect(() => applyReversiMove(state, 64)).toThrow('0 到 63')
    expect(() => applyReversiMove(state, 27)).toThrow('已經有棋子')
    expect(() => applyReversiMove(state, 0)).toThrow('不能包住')

    const full = stateWith(Array<ReversiCell>(REVERSI_BOARD_CELLS).fill('black'), 'white')
    const ended = resolveForcedPasses(full)
    expect(() => applyReversiMove(ended, 0)).toThrow('對局已經結束')
  })

  it('沒有合法步時自動略過並切換到仍可落子的對方', () => {
    const board = Array<ReversiCell>(REVERSI_BOARD_CELLS).fill('white')
    board[0] = null
    board[1] = 'black'
    board[2] = 'white'
    const state = stateWith(board, 'black')

    expect(mustPass(state)).toBe(true)
    const passed = resolveForcedPasses(state)
    expect(passed.currentPlayer).toBe('white')
    expect(passed.consecutivePasses).toBe(1)
    expect(passed.turns).toEqual([{ kind: 'pass', player: 'black' }])
    expect(getLegalReversiMoves(passed)).toEqual([0])
  })

  it('雙方皆無合法步時連續略過並依棋子數結束', () => {
    const board = Array<ReversiCell>(REVERSI_BOARD_CELLS).fill('black')
    board[0] = null
    const ended = resolveForcedPasses(stateWith(board, 'white'))

    expect(ended.phase).toBe('won')
    expect(ended.winner).toBe('black')
    expect(ended.consecutivePasses).toBe(2)
    expect(ended.turns).toEqual([{ kind: 'pass', player: 'white' }, { kind: 'pass', player: 'black' }])
  })

  it('滿盤與棋子相同時判為和局', () => {
    const board = Array.from({ length: REVERSI_BOARD_CELLS }, (_, move): ReversiCell =>
      Math.floor(move / REVERSI_BOARD_SIZE) % 2 === (move % REVERSI_BOARD_SIZE) % 2 ? 'black' : 'white',
    )
    const result = getGameResult(stateWith(board, 'black'))

    expect(result.phase).toBe('draw')
    expect(result.winner).toBeNull()
    expect(result.blackCount).toBe(32)
    expect(result.whiteCount).toBe(32)
  })

  it('序列化後可重播相同局面與自動略過，並拒絕遭竄改的棋盤、計數與紀錄', () => {
    let original = replayReversiMoves([19, 18, 17, 9])
    for (let turn = 0; turn < REVERSI_BOARD_CELLS && !original.turns.some((record) => record.kind === 'pass'); turn += 1) {
      const move = getLegalReversiMoves(original)[0]
      if (move === undefined) break
      original = applyReversiMove(original, move)
    }
    expect(original.turns.some((record) => record.kind === 'pass')).toBe(true)

    const restored = deserializeReversiState(serializeReversiState(original))
    expect(restored).toEqual(original)

    expect(() => deserializeReversiState(JSON.stringify({ ...original, blackCount: 99 }))).toThrow('不一致')
    expect(() => deserializeReversiState(JSON.stringify({ ...original, turns: [{ kind: 'pass', player: 'black' }] }))).toThrow('不合法')
    expect(() => deserializeReversiState('{壞掉')).toThrow('不是有效的 JSON')
  })
})
