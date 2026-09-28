import { describe, expect, it } from 'vitest'
import {
  agreeGoScore,
  calculateGoScore,
  createGoState,
  deserializeGoState,
  getGoGroup,
  passGoTurn,
  playGoMove,
  resignGoGame,
  resumeGoGame,
  serializeGoState,
  toggleGoDeadGroup,
} from './rules'

describe('圍棋規則核心', () => {
  it.each([9, 13, 19] as const)('%i 路以黑方先手建立正確棋盤', (size) => {
    const state = createGoState(size)
    expect(state.board).toHaveLength(size * size)
    expect(state.currentPlayer).toBe('black')
    expect(state.positionHistory).toHaveLength(1)
  })

  it('棋組以四方向連接並共用氣', () => {
    let state = createGoState(9)
    state = playGoMove(state, 40)
    state = playGoMove(state, 0)
    state = playGoMove(state, 41)
    const group = getGoGroup(state.board, 9, 40)
    expect(group.stones).toEqual([40, 41])
    expect(group.liberties).toContain(39)
    expect(group.liberties).toContain(49)
  })

  it('落子後立即提取失去最後一口氣的對方棋子', () => {
    let state = createGoState(9)
    state = playGoMove(state, 31)
    state = playGoMove(state, 40)
    state = playGoMove(state, 39)
    state = passGoTurn(state)
    state = playGoMove(state, 49)
    state = passGoTurn(state)
    state = playGoMove(state, 41)
    expect(state.board[40]).toBeNull()
    expect(state.prisoners.black).toBe(1)
    expect(state.moves.at(-1)?.captured).toEqual([40])
  })

  it('沒有提子的自殺著不合法且不改變原局面', () => {
    let state = createGoState(9)
    for (const move of [0, 31, 1, 39, 2, 49, 3, 41] as const) {
      state = playGoMove(state, move)
    }
    const before = serializeGoState(state)
    expect(() => playGoMove(state, 40)).toThrow('沒有氣')
    expect(serializeGoState(state)).toBe(before)
  })

  it('雙方連續虛著後進入計分，雙方同意後以數子法決定結果', () => {
    let state = createGoState(9)
    state = passGoTurn(state)
    expect(state.phase).toBe('playing')
    state = passGoTurn(state)
    expect(state.phase).toBe('scoring')
    state = agreeGoScore(state)
    state = agreeGoScore(state)
    expect(state.phase).toBe('finished')
    expect(state.endReason).toBe('score')
    expect(state.result).toEqual({ black: 0, white: 0, winner: null })
  })

  it('終局確認可標記整個相連棋組，變更後需重新取得雙方同意', () => {
    let state = createGoState(9)
    state = playGoMove(state, 40)
    state = passGoTurn(state)
    state = passGoTurn(state)
    state = toggleGoDeadGroup(state, 40)
    expect(state.deadStones).toEqual([40])
    state = agreeGoScore(state)
    state = toggleGoDeadGroup(state, 40)
    expect(state.deadStones).toEqual([])
    expect(state.scoreAgreedBy).toEqual([])
  })

  it('不同意終局局面可返回棋盤繼續，認輸則直接結束', () => {
    let state = passGoTurn(createGoState(9))
    state = passGoTurn(state)
    state = resumeGoGame(state)
    expect(state.phase).toBe('playing')
    expect(state.consecutivePasses).toBe(0)
    state = resignGoGame(state)
    expect(state.phase).toBe('finished')
    expect(state.result?.winner).toBe('white')
    expect(state.endReason).toBe('resignation')
  })

  it('以完整著手紀錄重播並拒絕被竄改的局面', () => {
    let state = playGoMove(createGoState(9), 40)
    state = passGoTurn(state)
    const serialized = serializeGoState(state)
    expect(deserializeGoState(serialized)).toEqual(state)
    const tampered = JSON.parse(serialized) as Record<string, unknown>
    tampered.currentPlayer = 'white'
    expect(() => deserializeGoState(JSON.stringify(tampered))).toThrow('不一致')
  })

  it('數子法只計單色活棋圍住的空區，雙色相鄰空區不計', () => {
    const state = createGoState(9)
    expect(calculateGoScore(state)).toEqual({ black: 0, white: 0, winner: null })
  })
})
