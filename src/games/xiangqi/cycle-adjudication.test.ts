import { describe, expect, it } from 'vitest'
import { adjudicateXiangqiCycle, classifyCertainXiangqiCycleConduct, findThreeXiangqiCycles, type XiangqiCycleConduct } from './cycle-adjudication'
import { applyMove, createInitialXiangqiState, getLegalMoves, isInCheck, positionKey, type XiangqiCell, type XiangqiState } from './rules'

describe('協會 113 年修訂版循環盤面比較表', () => {
  const cases: readonly [XiangqiCycleConduct, XiangqiCycleConduct, 'red' | 'black' | null][] = [
    ['perpetual-check', 'perpetual-check', null],
    ['perpetual-check', 'perpetual-chase', 'red'],
    ['perpetual-check', 'no-offence', 'red'],
    ['perpetual-chase', 'perpetual-check', 'black'],
    ['perpetual-chase', 'perpetual-chase', null],
    ['perpetual-chase', 'no-offence', 'red'],
    ['no-offence', 'perpetual-check', 'black'],
    ['no-offence', 'perpetual-chase', 'black'],
    ['no-offence', 'no-offence', null],
  ]

  it.each(cases)('紅方 %s、黑方 %s：不變著的判決', (red, black, loser) => {
    expect(adjudicateXiangqiCycle(red, black)).toEqual(
      loser === null ? { kind: 'draw', loser: null } : { kind: 'loss', loser },
    )
  })
})

describe('保守循環行為分類', () => {
  it('每一步都將軍才確認長將', () => {
    expect(classifyCertainXiangqiCycleConduct([
      { mover: 'red', gaveCheck: true, threatensCapture: true },
      { mover: 'black', gaveCheck: false, threatensCapture: false },
      { mover: 'red', gaveCheck: true, threatensCapture: false },
    ], 'red')).toBe('perpetual-check')
  })
  it('完全未將軍或威脅吃子，才確認未犯例；可能長捉時不得猜測', () => {
    const quiet = [{ mover: 'black' as const, gaveCheck: false, threatensCapture: false }]
    expect(classifyCertainXiangqiCycleConduct(quiet, 'black')).toBe('no-offence')
    expect(classifyCertainXiangqiCycleConduct(quiet, 'red')).toBeNull()
    expect(classifyCertainXiangqiCycleConduct([
      { mover: 'red', gaveCheck: false, threatensCapture: true },
      { mover: 'red', gaveCheck: false, threatensCapture: true },
    ], 'red')).toBeNull()
    expect(classifyCertainXiangqiCycleConduct([
      { mover: 'red', gaveCheck: true, threatensCapture: false },
      { mover: 'red', gaveCheck: false, threatensCapture: false },
    ], 'red')).toBeNull()
  })
})

it('官方圖 2.4-1a 的車連續將軍三循環：紅方須變著', () => {
  const base = createInitialXiangqiState()
  const board: XiangqiCell[] = Array.from({ length: 90 }, () => null)
  board[9 * 9 + 3] = { id: 'red-king-1', owner: 'red', kind: 'king', row: 9, column: 3 }
  board[4] = { id: 'black-king-1', owner: 'black', kind: 'king', row: 0, column: 4 }
  board[9 * 9 + 5] = { id: 'red-chariot-1', owner: 'red', kind: 'chariot', row: 9, column: 5 }
  const initial: XiangqiState = { ...base, board, positionHistory: [], repetitionCounts: {}, turns: [] }
  const key = positionKey(initial)
  let state: XiangqiState = { ...initial, positionHistory: [key], repetitionCounts: { [key]: 1 } }
  const evidence: { mover: 'red' | 'black'; gaveCheck: boolean; threatensCapture: boolean }[] = []
  const cycle: readonly [number, number][] = [[9 * 9 + 5, 9 * 9 + 4], [4, 5], [9 * 9 + 4, 9 * 9 + 5], [5, 4]]
  for (let turn = 0; turn < 12; turn += 1) {
    const mover = state.currentPlayer
    const [from, to] = cycle[turn % 4]!
    state = applyMove(state, from, to)
    evidence.push({ mover, gaveCheck: isInCheck(state, state.currentPlayer), threatensCapture: getLegalMoves(state, mover).some(move => move.capturedId !== null) })
  }
  expect(findThreeXiangqiCycles(state.positionHistory)).toEqual({ startIndex: 0, period: 4, repetitions: 3 })
  expect(classifyCertainXiangqiCycleConduct(evidence, 'red')).toBe('perpetual-check')
  expect(classifyCertainXiangqiCycleConduct(evidence, 'black')).toBe('no-offence')
  expect(adjudicateXiangqiCycle('perpetual-check', 'no-offence')).toEqual({ kind: 'loss', loser: 'red' })
  expect(state.phase).not.toBe('draw')
})

describe('完整循環偵測', () => {
  it('只在三次連續回到同一完整局面後回傳循環長度', () => {
    expect(findThreeXiangqiCycles(['甲', '乙', '甲', '乙', '甲'])).toBeNull()
    expect(findThreeXiangqiCycles(['甲', '乙', '甲', '乙', '甲', '乙', '甲']))
      .toEqual({ startIndex: 0, period: 2, repetitions: 3 })
  })

  it('中途變著就不把分散出現的相同局面誤認為同一循環', () => {
    expect(findThreeXiangqiCycles(['甲', '乙', '甲', '丙', '甲', '乙', '甲'])).toBeNull()
  })

  it('可辨認四著一循環，且只使用最近的連續循環', () => {
    const cycle = ['甲', '乙', '丙', '丁']
    expect(findThreeXiangqiCycles(['舊', ...cycle, ...cycle, ...cycle, '甲']))
      .toEqual({ startIndex: 1, period: 4, repetitions: 3 })
  })

  it('真實棋盤兩匹馬往返三循環仍不擅自判和', () => {
    let state = createInitialXiangqiState({ repetitionLimit: 3 })
    const steps = [[82, 65], [1, 20], [65, 82], [20, 1]] as const
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const [from, to] of steps) state = applyMove(state, from, to)
    }
    expect(state.positionHistory).toHaveLength(13)
    expect(findThreeXiangqiCycles(state.positionHistory))
      .toEqual({ startIndex: 0, period: 4, repetitions: 3 })
    expect(state.phase).toBe('playing')
    expect(state.winner).toBeNull()
    expect(state.repetitionCounts[state.positionHistory[0]!]).toBe(4)
  })
})
