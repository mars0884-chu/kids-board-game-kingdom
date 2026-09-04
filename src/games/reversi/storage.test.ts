import { describe, expect, it } from 'vitest'
import { deserializeReversiState, replayReversiMoves, serializeReversiState } from './rules'

describe('黑白棋存檔資料契約', () => {
  it('可序列化並恢復含翻子的可重播局面', () => {
    const state = replayReversiMoves([19, 18, 17, 9])
    const restored = deserializeReversiState(serializeReversiState(state))
    expect(restored.turns).toEqual(state.turns)
    expect(restored.board).toEqual(state.board)
    expect(restored.blackCount).toBe(state.blackCount)
    expect(restored.whiteCount).toBe(state.whiteCount)
  })
})
