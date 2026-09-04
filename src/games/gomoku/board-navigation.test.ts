import { describe, expect, it } from 'vitest'
import { findNearestEmptyGomokuMove, findNextEmptyGomokuMove } from './board-navigation'
import { GOMOKU_BOARD_CELLS, type GomokuCell } from './rules'

function emptyBoard(): GomokuCell[] {
  return Array.from({ length: GOMOKU_BOARD_CELLS }, () => null)
}

describe('五子棋鍵盤棋盤導覽', () => {
  it('從中央開始，方向鍵會移到相鄰空交點', () => {
    const board = emptyBoard()

    expect(findNextEmptyGomokuMove(board, 112, 'ArrowRight')).toBe(113)
    expect(findNextEmptyGomokuMove(board, 112, 'ArrowUp')).toBe(97)
  })

  it('會跳過已落子的交點，且不會越過棋盤邊界', () => {
    const board = emptyBoard()
    board[113] = 'black'
    board[114] = 'white'

    expect(findNextEmptyGomokuMove(board, 112, 'ArrowRight')).toBe(115)
    expect(findNextEmptyGomokuMove(board, 14, 'ArrowRight')).toBeNull()
  })

  it('目前焦點被占用時，會選擇最近的空交點', () => {
    const board = emptyBoard()
    board[112] = 'black'

    expect(findNearestEmptyGomokuMove(board, 112)).toBe(97)
  })
})
