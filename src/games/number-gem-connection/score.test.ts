import { describe, expect, it } from 'vitest'
import {
  createInitialNumberGemScore,
  isNumberGemLocalMatchComplete,
  normalizeNumberGemScore,
  NUMBER_GEM_LOCAL_QUESTIONS,
  recordNumberGemCompletion,
} from './score'

describe('數字寶石連線記分板', () => {
  it('完成一題增加一顆智慧星星，提示不影響記分規則', () => {
    const initial = createInitialNumberGemScore()
    const next = recordNumberGemCompletion(initial, 'npc', 1)
    expect(next.stars).toBe(1)
    expect(next.localStars).toEqual({ 1: 0, 2: 0 })
  })

  it('雙人各完成三題後才結束這一局', () => {
    let score = createInitialNumberGemScore()
    for (let question = 0; question < NUMBER_GEM_LOCAL_QUESTIONS; question += 1) {
      score = recordNumberGemCompletion(score, 'local', 1)
      expect(isNumberGemLocalMatchComplete(score)).toBe(false)
    }
    for (let question = 0; question < NUMBER_GEM_LOCAL_QUESTIONS; question += 1) {
      score = recordNumberGemCompletion(score, 'local', 2)
    }
    expect(score.localStars).toEqual({ 1: 3, 2: 3 })
    expect(score.localQuestions).toEqual({ 1: 3, 2: 3 })
    expect(isNumberGemLocalMatchComplete(score)).toBe(true)
    expect(recordNumberGemCompletion(score, 'local', 2)).toEqual(score)
  })

  it('可載入舊版沒有記分板的存檔，錯誤資料會被拒絕', () => {
    expect(normalizeNumberGemScore(undefined)).toBeNull()
    expect(normalizeNumberGemScore({ stars: 0, localStars: { 1: 0, 2: 0 }, localQuestions: { 1: 0, 2: 0 } })).toEqual(createInitialNumberGemScore())
    expect(normalizeNumberGemScore({ stars: 0, localStars: { 1: 0, 2: 0 }, localQuestions: { 1: 4, 2: 0 } })).toBeNull()
  })
})
