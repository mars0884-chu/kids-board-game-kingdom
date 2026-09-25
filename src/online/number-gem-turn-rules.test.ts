import { describe, expect, it } from 'vitest'
import { advanceOnlineNumberGemRound, chooseOnlineNumberGemCell, createNumberGemOnlineMatch, numberGemOnlineRules, undoOnlineNumberGemCell } from './number-gem-turn-rules'
import { findNumberGemSolutionPath } from '../games/number-gem-connection/generator'

describe('數字寶石連線完整回合', () => {
  it('同步選格與復原，拒絕直接改分數', () => {
    const initial = createNumberGemOnlineMatch()
    const solution = findNumberGemSolutionPath(initial.state.puzzle)!
    const selected = chooseOnlineNumberGemCell(initial, solution[0]!)
    expect(numberGemOnlineRules.isLegalStep(initial, selected)).toBe(true)
    expect(numberGemOnlineRules.isLegalStep(selected, undoOnlineNumberGemCell(selected))).toBe(true)
    expect(numberGemOnlineRules.isLegalStep(initial, { ...initial, score: { ...initial.score, stars: 99 } })).toBe(false)
  })

  it('每完成一題就換玩家，兩人各完成三題才結束', () => {
    let match = createNumberGemOnlineMatch()
    for (let round = 0; round < 6; round += 1) {
      const solution = findNumberGemSolutionPath(match.state.puzzle)!
      for (const index of solution) {
        const next = chooseOnlineNumberGemCell(match, index)
        expect(numberGemOnlineRules.isLegalStep(match, next)).toBe(true)
        match = next
      }
      expect(match.state.phase).toBe('completed')
      expect(match.score.localQuestions[round % 2 === 0 ? 1 : 2]).toBe(Math.floor(round / 2) + 1)
      const next = advanceOnlineNumberGemRound(match)
      if (round === 5) {
        expect(next).toBe(match)
        break
      }
      expect(numberGemOnlineRules.isLegalStep(match, next)).toBe(true)
      expect(next.roundSeed).toBe(match.roundSeed + 1)
      expect(numberGemOnlineRules.currentRole(next)).toBe(round % 2 === 0 ? 'guest' : 'host')
      match = next
    }
  })

  it('反序列化拒絕同 ID 的竄改題目', () => {
    const parsed = JSON.parse(numberGemOnlineRules.serialize(createNumberGemOnlineMatch()))
    const state = JSON.parse(parsed.state)
    state.puzzle.board[0] += 1
    parsed.state = JSON.stringify(state)
    expect(() => numberGemOnlineRules.deserialize(JSON.stringify(parsed))).toThrow('題目與回合不一致')
  })
})
