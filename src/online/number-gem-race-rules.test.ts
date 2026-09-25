import { describe, expect, it } from 'vitest'
import { findNumberGemSolutionPath, createNumberGemPuzzle } from '../games/number-gem-connection/generator'
import {
  createNumberGemRaceState,
  expireNumberGemRace,
  readyNumberGemRace,
  solveNumberGemRace,
  NUMBER_GEM_RACE_SECONDS,
  type NumberGemRaceState,
} from './number-gem-race-rules'

function start(state: NumberGemRaceState, now: number): NumberGemRaceState {
  return readyNumberGemRace(readyNumberGemRace(state, 'host', now), 'guest', now)
}

function correctPath(state: NumberGemRaceState): readonly number[] {
  const path = findNumberGemSolutionPath(createNumberGemPuzzle(state.seed, 'beginner'))
  if (path === null) throw new Error('題目缺少解答。')
  return path
}

describe('數字寶石雙人搶答', () => {
  it('雙方準備後共用同一題，起跑時間由服務決定', () => {
    const waiting = readyNumberGemRace(createNumberGemRaceState(), 'host', 1000)
    expect(waiting.phase).toBe('ready')
    const started = readyNumberGemRace(waiting, 'guest', 1200)
    expect(started.phase).toBe('playing')
    expect(started.startsAt).toBe(4200)
    expect(started.deadlineAt).toBe(4200 + NUMBER_GEM_RACE_SECONDS * 1000)
    expect(() => solveNumberGemRace(started, 'host', correctPath(started), 4199)).toThrow()
  })

  it('只有服務首先收到的有效正解得分，第二份不會重複計分', () => {
    const started = start(createNumberGemRaceState(), 1000)
    expect(() => solveNumberGemRace(started, 'host', [999], 4000)).toThrow('答案尚未完成')
    const won = solveNumberGemRace(started, 'guest', correctPath(started), 4000)
    expect(won.scores).toEqual({ host: 0, guest: 1 })
    expect(won.decidedRounds).toBe(1)
    expect(() => solveNumberGemRace(won, 'host', correctPath(started), 4000)).toThrow()
    expect(start(won, 5000).seed).toBe(started.seed + 1)
  })

  it('90 秒無人解答換新題，不扣分也不消耗五局', () => {
    const started = start(createNumberGemRaceState(), 1000)
    const expired = expireNumberGemRace(started, started.deadlineAt!)
    expect(expired.phase).toBe('ready')
    expect(expired.seed).toBe(started.seed + 1)
    expect(expired.decidedRounds).toBe(0)
    expect(expired.scores).toEqual({ host: 0, guest: 0 })
    expect(() => solveNumberGemRace(started, 'guest', correctPath(started), started.deadlineAt!)).toThrow()
  })

  it('先達三分即結束，最多五個有勝負回合', () => {
    let state = createNumberGemRaceState()
    for (const [index, role] of (['host', 'guest', 'host', 'guest', 'host'] as const).entries()) {
      state = start(state, 1000 + index * 10000)
      state = solveNumberGemRace(state, role, correctPath(state), state.startsAt!)
    }
    expect(state.phase).toBe('complete')
    expect(state.matchWinner).toBe('host')
    expect(state.scores).toEqual({ host: 3, guest: 2 })
    expect(state.decidedRounds).toBe(5)
    expect(() => readyNumberGemRace(state, 'guest', 100000)).toThrow()
  })
})
