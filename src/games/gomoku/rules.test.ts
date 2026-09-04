import { describe, expect, it } from 'vitest'
import {
  GOMOKU_BOARD_CELLS,
  createGomokuState,
  deserializeGomokuState,
  getLegalGomokuMoves,
  replayGomokuMoves,
  serializeGomokuState,
} from './rules'

const at = (row: number, column: number): number => row * 15 + column
const DRAW_MOVES: readonly number[] = [0,4,1,9,2,14,3,19,5,24,6,29,7,31,8,35,10,36,11,40,12,41,13,48,15,50,16,53,17,55,18,58,20,60,21,62,22,65,23,67,25,70,26,72,27,76,28,77,30,79,32,81,33,82,34,84,37,86,38,87,39,89,42,91,43,93,44,94,45,96,46,98,47,99,49,101,51,103,52,104,54,105,56,106,57,108,59,110,61,111,63,113,64,115,66,116,68,118,69,120,71,122,73,123,74,125,75,127,78,128,80,130,83,132,85,133,88,135,90,137,92,139,95,140,97,142,100,144,102,145,107,147,109,149,112,151,114,152,117,154,119,156,121,157,124,159,126,161,129,162,131,164,134,166,136,168,138,169,141,171,143,173,146,174,148,176,150,178,153,179,155,180,158,181,160,183,163,185,165,186,167,188,170,190,172,191,175,193,177,195,182,197,184,198,187,200,189,202,192,203,194,205,196,207,199,208,201,210,204,212,206,214,209,215,211,217,213,219,216,220,218,222,221,224,223]

describe('五子棋規則核心', () => {
  it('新局為 15×15、黑方先手並提供 225 個合法落點', () => {
    const state = createGomokuState()

    expect(state.currentPlayer).toBe('black')
    expect(state.board).toHaveLength(GOMOKU_BOARD_CELLS)
    expect(getLegalGomokuMoves(state)).toHaveLength(225)
  })

  it('黑方形成恰好五子時獲勝', () => {
    const state = replayGomokuMoves([
      at(7, 3), at(0, 0),
      at(7, 4), at(0, 1),
      at(7, 5), at(0, 2),
      at(7, 6), at(0, 3),
      at(7, 7),
    ])

    expect(state.phase).toBe('won')
    expect(state.winner).toBe('black')
    expect(state.winningLine).toEqual([at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7)])
    expect(getLegalGomokuMoves(state)).toEqual([])
  })

  it('白方形成五子以上時獲勝', () => {
    const state = replayGomokuMoves([
      at(0, 0), at(7, 3),
      at(0, 2), at(7, 4),
      at(0, 4), at(7, 5),
      at(0, 6), at(7, 6),
      at(0, 8), at(7, 7),
    ])

    expect(state.phase).toBe('won')
    expect(state.winner).toBe('white')
    expect(state.winningLine).toEqual([at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7)])
  })

  it('棋盤填滿且沒有五連線時判定和局', () => {
    const state = replayGomokuMoves(DRAW_MOVES)

    expect(state.board).toHaveLength(225)
    expect(state.phase).toBe('draw')
    expect(state.winner).toBeNull()
    expect(state.winningLine).toBeNull()
    expect(getLegalGomokuMoves(state)).toEqual([])
  })

  it('拒絕黑方六子以上長連線禁手', () => {
    const moves = [
      at(7, 3), at(0, 0),
      at(7, 4), at(0, 2),
      at(7, 5), at(0, 4),
      at(7, 6), at(0, 6),
      at(7, 8), at(0, 8),
      at(7, 7),
    ]

    expect(() => replayGomokuMoves(moves)).toThrow('overline')
  })

  it('拒絕黑方雙四禁手', () => {
    const blackMoves = [
      at(7, 5), at(7, 6), at(7, 8),
      at(5, 7), at(6, 7), at(8, 7),
    ]
    const moves: number[] = []
    for (const move of blackMoves) {
      moves.push(move, at(0, moves.length))
    }
    moves.push(at(7, 7))

    expect(() => replayGomokuMoves(moves)).toThrow('double-four')
  })

  it('拒絕黑方雙三禁手', () => {
    const blackMoves = [at(7, 6), at(7, 8), at(6, 7), at(8, 7)]
    const moves: number[] = []
    for (const move of blackMoves) {
      moves.push(move, at(0, moves.length))
    }
    moves.push(at(7, 7))

    expect(() => replayGomokuMoves(moves)).toThrow('double-three')
  })

  it('序列化後可由走棋紀錄重播為相同局面', () => {
    const original = replayGomokuMoves([at(7, 7), at(7, 8), at(6, 7), at(6, 8)])
    const restored = deserializeGomokuState(serializeGomokuState(original))

    expect(restored).toEqual(original)
  })

  it('拒絕遭竄改的棋盤或無效 JSON', () => {
    const state = replayGomokuMoves([at(7, 7), at(7, 8)])
    const tampered = { ...state, board: Array<null>(GOMOKU_BOARD_CELLS).fill(null) }

    expect(() => deserializeGomokuState(JSON.stringify(tampered))).toThrow('不一致')
    expect(() => deserializeGomokuState('{壞掉')).toThrow('不是有效的 JSON')
  })
})
