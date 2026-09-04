import { describe, expect, it } from 'vitest'
import { getGomokuForbiddenReason, replayGomokuMoves } from './rules'

const at = (row: number, column: number) => row * 15 + column

describe('黑方禁手回饋', () => {
  it('雙三位置不落子、不換手，仍能改下其他合法空位', () => {
    const state = replayGomokuMoves([
      at(7, 6), at(0, 0), at(7, 8), at(0, 2),
      at(6, 7), at(0, 4), at(8, 7), at(0, 6),
    ])
    const forbidden = at(7, 7)
    expect(getGomokuForbiddenReason(state, forbidden)).toBe('double-three')
    expect(state.board[forbidden]).toBeNull()
    expect(state.currentPlayer).toBe('black')
    expect(getGomokuForbiddenReason(state, at(1, 1))).toBeNull()
  })
})
