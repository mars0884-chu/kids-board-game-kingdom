import { describe, expect, it } from 'vitest'
import {
  GOMOKU_ADVENTURE_LEVELS,
  completesGomokuAdventureLevel,
  createGomokuAdventureState,
  isGomokuAdventureMoveCorrect,
  nextGomokuAdventureLevel,
} from './adventure'
import { getGomokuForbiddenReason, isLegalGomokuMove, playGomokuMove } from './rules'

describe('五子棋冒險關卡', () => {
  it('每一關都以合法的十五乘十五固定局面開始，且目標可完成', () => {
    expect(GOMOKU_ADVENTURE_LEVELS).toHaveLength(4)
    for (const level of GOMOKU_ADVENTURE_LEVELS) {
      const state = createGomokuAdventureState(level)
      expect(state.board).toHaveLength(225)
      expect(state.currentPlayer).toBe('black')
      for (const target of level.targetMoves) {
        expect(isLegalGomokuMove(state, target)).toBe(true)
        expect(isGomokuAdventureMoveCorrect(level, state, target)).toBe(true)
        expect(completesGomokuAdventureLevel(level, state, target)).toBe(true)
      }
    }
  })

  it('第一關兩端皆可讓黑方以恰好五子完成，其他位置不會通關', () => {
    const level = GOMOKU_ADVENTURE_LEVELS[0]!
    const state = createGomokuAdventureState(level)
    expect(completesGomokuAdventureLevel(level, state, 110)).toBe(false)
    expect(level.targetMoves).toEqual([111, 116])
    for (const target of level.targetMoves) {
      const completed = playGomokuMove(state, target)
      expect(completed.phase).toBe('won')
      expect(completed.winner).toBe('black')
    }
  })

  it('禁手關明示雙三禁手，任何其他合法位置皆可完成', () => {
    const level = GOMOKU_ADVENTURE_LEVELS[3]!
    const state = createGomokuAdventureState(level)
    expect(getGomokuForbiddenReason(state, level.forbiddenMove!)).toBe('double-three')
    expect(isLegalGomokuMove(state, level.targetMoves[0]!)).toBe(true)
    expect(completesGomokuAdventureLevel(level, state, level.targetMoves[0]!)).toBe(true)
    expect(isLegalGomokuMove(state, 224)).toBe(true)
    expect(isGomokuAdventureMoveCorrect(level, state, 224)).toBe(true)
    expect(completesGomokuAdventureLevel(level, state, 224)).toBe(true)
  })

  it('關卡順序固定，最後一關沒有下一關', () => {
    expect(nextGomokuAdventureLevel('connect-five')?.id).toBe('block-four')
    expect(nextGomokuAdventureLevel('avoid-double-three')).toBeNull()
  })
})
