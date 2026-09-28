import { describe, expect, it } from 'vitest'
import {
  adjudicateXiangqiCycle,
  classifyCertainXiangqiCycleConduct,
  findThreeXiangqiCycles,
  type XiangqiChaseTargetEvidence,
  type XiangqiCycleConduct,
  type XiangqiCycleMoveEvidence,
} from './cycle-adjudication'
import { applyMove, createInitialXiangqiState, positionKey, type XiangqiCell, type XiangqiKind, type XiangqiPlayer, type XiangqiState } from './rules'

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
  it.each(cases)('紅方 %s、黑方 %s：三循環判決', (red, black, loser) => {
    expect(adjudicateXiangqiCycle(red, black)).toEqual(
      loser === null ? { kind: 'draw', loser: null } : { kind: 'loss', loser },
    )
  })
})

function chaseTarget(overrides: Partial<XiangqiChaseTargetEvidence> = {}): XiangqiChaseTargetEvidence {
  return {
    targetId: 'target',
    targetKind: 'horse',
    targetUncrossedSoldier: false,
    attackerIds: ['attacker'],
    attackerKinds: ['chariot'],
    trueRootAttackerIds: [],
    pinnedAttackerIds: [],
    blockedHorseLegAttackerIds: [],
    ...overrides,
  }
}
function move(mover: XiangqiPlayer, options: {
  readonly gaveCheck?: boolean
  readonly chaseTargets?: readonly XiangqiChaseTargetEvidence[]
} = {}): XiangqiCycleMoveEvidence {
  const chaseTargets = options.chaseTargets ?? []
  return { mover, gaveCheck: options.gaveCheck ?? false, threatensCapture: chaseTargets.length > 0, chaseTargets }
}

describe('三循環行為分類與協會例外', () => {
  it('同一方每一步都將軍才分類為長將；混合將軍與停著不作長將或長捉', () => {
    expect(classifyCertainXiangqiCycleConduct([move('red', { gaveCheck: true }), move('black'), move('red', { gaveCheck: true })], 'red')).toBe('perpetual-check')
    expect(classifyCertainXiangqiCycleConduct([move('red', { gaveCheck: true }), move('red', { chaseTargets: [chaseTarget()] })], 'red')).toBe('no-offence')
  })

  it('持續威脅同一棋子才分類為長捉，分捉或中斷不判長捉', () => {
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget()] }), move('black'), move('red', { chaseTargets: [chaseTarget()] })], 'red')).toBe('perpetual-chase')
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget()] }), move('red', { chaseTargets: [chaseTarget({ targetId: 'another' })] })], 'red')).toBe('no-offence')
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget(), chaseTarget({ targetId: 'another' })] }), move('red', { chaseTargets: [chaseTarget()] })], 'red')).toBe('no-offence')
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget()] }), move('red')], 'red')).toBe('no-offence')
  })

  it('遵守未過河兵卒、將帥／兵卒參與、真根、同類子與拐腳馬例外', () => {
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget({ targetKind: 'soldier', targetUncrossedSoldier: true })]), move('red', { chaseTargets: [chaseTarget({ targetKind: 'soldier', targetUncrossedSoldier: true })])], 'red')).toBe('no-offence')
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget({ attackerKinds: ['soldier'] })]), move('red', { chaseTargets: [chaseTarget({ attackerKinds: ['soldier'] })])], 'red')).toBe('no-offence')
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget({ trueRootAttackerIds: ['attacker'] })]), move('red', { chaseTargets: [chaseTarget({ trueRootAttackerIds: ['attacker'] })])], 'red')).toBe('no-offence')
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget({ targetKind: 'chariot', attackerKinds: ['horse'], trueRootAttackerIds: ['attacker'] })]), move('red', { chaseTargets: [chaseTarget({ targetKind: 'chariot', attackerKinds: ['horse'], trueRootAttackerIds: ['attacker'] })])], 'red')).toBe('perpetual-chase')
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget({ targetKind: 'chariot', attackerKinds: ['chariot'] })]), move('red', { chaseTargets: [chaseTarget({ targetKind: 'chariot', attackerKinds: ['chariot'] })])], 'red')).toBe('no-offence')
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget({ targetKind: 'chariot', attackerKinds: ['chariot'], pinnedAttackerIds: ['attacker'] })]), move('red', { chaseTargets: [chaseTarget({ targetKind: 'chariot', attackerKinds: ['chariot'], pinnedAttackerIds: ['attacker'] })])], 'red')).toBe('perpetual-chase')
    expect(classifyCertainXiangqiCycleConduct([move('red', { chaseTargets: [chaseTarget({ targetKind: 'horse', attackerKinds: ['horse'], blockedHorseLegAttackerIds: ['attacker'] })]), move('red', { chaseTargets: [chaseTarget({ targetKind: 'horse', attackerKinds: ['horse'], blockedHorseLegAttackerIds: ['attacker'] })])], 'red')).toBe('perpetual-chase')
  })

  it('舊棋譜缺少攻擊明細時不猜測長捉', () => {
    expect(classifyCertainXiangqiCycleConduct([
      { mover: 'red', gaveCheck: false, threatensCapture: true },
      { mover: 'red', gaveCheck: false, threatensCapture: true },
    ], 'red')).toBeNull()
  })
})

function stateFrom(placements: readonly { readonly owner: XiangqiPlayer; readonly kind: XiangqiKind; readonly row: number; readonly column: number }[]): XiangqiState {
  const base = createInitialXiangqiState()
  const board: XiangqiCell[] = Array.from({ length: 90 }, () => null)
  placements.forEach((placement, index) => {
    board[placement.row * 9 + placement.column] = { ...placement, id: `${placement.owner}-${placement.kind}-${index}` }
  })
  const prepared: XiangqiState = { ...base, board, currentPlayer: 'red', phase: 'playing', winner: null, drawReason: null, positionHistory: [], repetitionCounts: {}, turns: [] }
  const key = positionKey(prepared)
  return { ...prepared, positionHistory: [key], repetitionCounts: { [key]: 1 } }
}

it('實際套用每一步：紅方長將三循環判負', () => {
  let state = stateFrom([
    { owner: 'red', kind: 'king', row: 9, column: 3 },
    { owner: 'black', kind: 'king', row: 0, column: 4 },
    { owner: 'red', kind: 'chariot', row: 9, column: 5 },
  ])
  const cycle: readonly [number, number][] = [[86, 85], [4, 5], [85, 86], [5, 4]]
  for (let turn = 0; turn < 12; turn += 1) {
    const [from, to] = cycle[turn % cycle.length]!
    state = applyMove(state, from, to)
  }
  expect(findThreeXiangqiCycles(state.positionHistory)).toEqual({ startIndex: 0, period: 4, repetitions: 3 })
  expect(state.phase).toBe('won')
  expect(state.winner).toBe('black')
  expect(state.drawReason).toBeNull()
})

it('實際套用每一步：紅車三循環長捉黑馬，紅方判負', () => {
  let state = stateFrom([
    { owner: 'red', kind: 'king', row: 9, column: 4 },
    { owner: 'black', kind: 'king', row: 0, column: 4 },
    { owner: 'red', kind: 'soldier', row: 6, column: 4 },
    { owner: 'red', kind: 'chariot', row: 4, column: 0 },
    { owner: 'black', kind: 'horse', row: 2, column: 4 },
  ])
  const cycle: readonly [number, number][] = [[36, 18], [22, 39], [18, 36], [39, 22]]
  for (let turn = 0; turn < 12; turn += 1) {
    const [from, to] = cycle[turn % cycle.length]!
    state = applyMove(state, from, to)
  }
  expect(findThreeXiangqiCycles(state.positionHistory)).toEqual({ startIndex: 0, period: 4, repetitions: 3 })
  expect(state.phase).toBe('won')
  expect(state.winner).toBe('black')
})

describe('完整循環偵測', () => {
  it('只在三次連續回到同一完整局面後回傳循環長度', () => {
    expect(findThreeXiangqiCycles(['甲', '乙', '甲', '乙', '甲'])).toBeNull()
    expect(findThreeXiangqiCycles(['甲', '乙', '甲', '乙', '甲', '乙', '甲'])).toEqual({ startIndex: 0, period: 2, repetitions: 3 })
  })
  it('中途變著就不把分散出現的相同局面誤認為同一循環', () => {
    expect(findThreeXiangqiCycles(['甲', '乙', '甲', '丙', '甲', '乙', '甲'])).toBeNull()
  })
  it('可辨認四著一循環，且只使用最近的連續循環', () => {
    const cycle = ['甲', '乙', '丙', '丁']
    expect(findThreeXiangqiCycles(['舊', ...cycle, ...cycle, ...cycle, '甲'])).toEqual({ startIndex: 1, period: 4, repetitions: 3 })
  })
  it('完全安靜的真實重複局面在三循環後判和', () => {
    let state = createInitialXiangqiState()
    const steps = [[82, 65], [1, 20], [65, 82], [20, 1]] as const
    for (let cycle = 0; cycle < 3; cycle += 1) for (const [from, to] of steps) state = applyMove(state, from, to)
    expect(state.positionHistory).toHaveLength(13)
    expect(findThreeXiangqiCycles(state.positionHistory)).toEqual({ startIndex: 0, period: 4, repetitions: 3 })
    expect(state.phase).toBe('draw')
    expect(state.drawReason).toBe('repetition')
  })
})
