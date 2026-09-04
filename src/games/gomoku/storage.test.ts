import { describe, expect, it } from 'vitest'
import { deserializeGomokuState, replayGomokuMoves } from './rules'

describe('五子棋存檔資料契約', () => {
  it('可序列化並恢復可重播的局面', () => {
    const state = replayGomokuMoves([112, 97, 113, 98])
    const restored = deserializeGomokuState(JSON.stringify(state))
    expect(restored.moves).toEqual(state.moves)
    expect(restored.board).toEqual(state.board)
  })
})
