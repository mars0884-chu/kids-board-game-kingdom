import { describe, expect, it } from 'vitest'
import {
  createNumberGemPuzzle,
  createNumberGemTutorialPuzzle,
  enumerateNumberGemPaths,
  NUMBER_GEM_TUTORIAL_COUNT,
} from './generator'

describe('數字寶石連線固定種子題目', () => {
  it('相同種子與難度會產生相同盤面', () => {
    expect(createNumberGemPuzzle(20260825, 'beginner')).toEqual(createNumberGemPuzzle(20260825, 'beginner'))
    expect(createNumberGemPuzzle(20260825, 'adult')).toEqual(createNumberGemPuzzle(20260825, 'adult'))
  })

  it('四階難度只使用 3×3 或 4×4，並提供至少兩條解法', () => {
    const beginner = createNumberGemPuzzle(20260825, 'beginner')
    const growth = createNumberGemPuzzle(20260826, 'growth')
    const challenge = createNumberGemPuzzle(20260827, 'challenge')
    const adult = createNumberGemPuzzle(20260828, 'adult')
    expect(beginner.boardSize).toBe(3)
    expect(growth.boardSize).toBe(3)
    expect(challenge.boardSize).toBe(4)
    expect(adult.boardSize).toBe(4)
    expect([beginner, growth, challenge, adult].every((puzzle) => puzzle.solutionCount >= 2)).toBe(true)
  })

  it('教學固定為四關，且第三、四關使用 4×4', () => {
    expect(NUMBER_GEM_TUTORIAL_COUNT).toBe(4)
    expect(createNumberGemTutorialPuzzle(0).boardSize).toBe(3)
    expect(createNumberGemTutorialPuzzle(1).boardSize).toBe(3)
    expect(createNumberGemTutorialPuzzle(2).boardSize).toBe(4)
    expect(createNumberGemTutorialPuzzle(3).boardSize).toBe(4)
  })

  it('路徑列舉不包含斜角與重複格', () => {
    const paths = enumerateNumberGemPaths(3, 2, 4)
    expect(paths.every((path) => new Set(path).size === path.length)).toBe(true)
    expect(paths.some((path) => path.length === 2 && path[0] === 0 && path[1] === 4)).toBe(false)
  })
})
