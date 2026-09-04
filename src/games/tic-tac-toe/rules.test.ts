import { describe, expect, it } from 'vitest'
import {
  createTicTacToeState,
  deserializeTicTacToeState,
  getLegalTicTacToeMoves,
  playTicTacToeMove,
  replayTicTacToeMoves,
  serializeTicTacToeState,
  type TicTacToeMove,
} from './rules'

describe('井字棋規則核心', () => {
  it('新局由 x 先手並提供 9 個合法空格', () => {
    const state = createTicTacToeState()

    expect(state.currentPlayer).toBe('x')
    expect(state.phase).toBe('playing')
    expect(getLegalTicTacToeMoves(state)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it.each([
    { moves: [0, 3, 1, 4, 2], line: [0, 1, 2] },
    { moves: [0, 1, 3, 2, 6], line: [0, 3, 6] },
    { moves: [0, 1, 4, 2, 8], line: [0, 4, 8] },
  ] satisfies { moves: TicTacToeMove[]; line: number[] }[])('辨識橫向、直向與對角線勝局', ({ moves, line }) => {
    const state = replayTicTacToeMoves(moves)

    expect(state.phase).toBe('won')
    expect(state.winner).toBe('x')
    expect(state.winningLine).toEqual(line)
    expect(getLegalTicTacToeMoves(state)).toEqual([])
  })

  it('棋盤填滿且無人連線時判定和局', () => {
    const state = replayTicTacToeMoves([0, 1, 2, 4, 3, 5, 7, 6, 8])

    expect(state.phase).toBe('draw')
    expect(state.winner).toBeNull()
    expect(state.winningLine).toBeNull()
  })

  it('拒絕重複落點、範圍外位置與終局後落子', () => {
    const oneMove = playTicTacToeMove(createTicTacToeState(), 0)
    expect(() => playTicTacToeMove(oneMove, 0)).toThrow('這一格已經有棋子。')
    expect(() => playTicTacToeMove(oneMove, 9 as TicTacToeMove)).toThrow('0 到 8')

    const won = replayTicTacToeMoves([0, 3, 1, 4, 2])
    expect(() => playTicTacToeMove(won, 5)).toThrow('對局已經結束')
  })

  it('序列化後可由走棋紀錄重播為相同局面', () => {
    const original = replayTicTacToeMoves([0, 4, 2, 1])
    const restored = deserializeTicTacToeState(serializeTicTacToeState(original))

    expect(restored).toEqual(original)
  })

  it('拒絕棋盤、輪次或終局遭竄改的存檔', () => {
    const state = replayTicTacToeMoves([0, 4, 2])
    const tampered = { ...state, board: [null, null, null, null, null, null, null, null, null] }

    expect(() => deserializeTicTacToeState(JSON.stringify(tampered))).toThrow('不一致')
    expect(() => deserializeTicTacToeState('{壞掉')).toThrow('不是有效的 JSON')
  })
})
