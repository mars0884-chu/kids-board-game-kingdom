import { describe, expect, it } from 'vitest'
import { createNumberGemTutorialPuzzle } from './generator'
import {
  chooseNumberGemCell,
  createNumberGemState,
  deserializeNumberGemState,
  evaluateNumberGemPath,
  serializeNumberGemState,
  undoNumberGemCell,
} from './rules'

describe('數字寶石連線規則核心', () => {
  it('只接受上下左右相鄰且不重複的路徑', () => {
    const puzzle = createNumberGemTutorialPuzzle(0)
    expect(evaluateNumberGemPath(puzzle, [0, 1]).status).toBe('completed')
    expect(evaluateNumberGemPath(puzzle, [0, 4]).reason).toBe('non-adjacent')
    expect(evaluateNumberGemPath(puzzle, [0, 1, 0]).reason).toBe('repeated-cell')
  })

  it('完成後鎖定局面，未完成可以退回最後一顆', () => {
    const puzzle = createNumberGemTutorialPuzzle(1)
    let state = createNumberGemState(puzzle)
    state = chooseNumberGemCell(state, 0).state
    expect(state.phase).toBe('playing')
    state = undoNumberGemCell(state)
    expect(state.path).toEqual([])
    state = chooseNumberGemCell(state, 3).state
    state = chooseNumberGemCell(state, 4).state
    expect(state.phase).toBe('completed')
    expect(chooseNumberGemCell(state, 5).state).toBe(state)
  })

  it('超過目標時保留可退回的路徑，不直接判定失敗', () => {
    const puzzle = createNumberGemTutorialPuzzle(0)
    const state = createNumberGemState(puzzle)
    const result = chooseNumberGemCell(chooseNumberGemCell(state, 3).state, 4)
    expect(result.evaluation.status).toBe('over')
    expect(undoNumberGemCell(result.state).path).toEqual([3])
  })

  it('拿走題使用 start - remaining 的目標差值', () => {
    const puzzle = createNumberGemTutorialPuzzle(3)
    expect(puzzle.type).toBe('take-away')
    expect(puzzle.start! - puzzle.remaining!).toBe(puzzle.target)
    expect(evaluateNumberGemPath(puzzle, [0, 1]).status).toBe('completed')
  })

  it('序列化後會重算總和並拒絕竄改', () => {
    const puzzle = createNumberGemTutorialPuzzle(2)
    const state = chooseNumberGemCell(chooseNumberGemCell(createNumberGemState(puzzle), 0).state, 1).state
    const restored = deserializeNumberGemState(serializeNumberGemState(state))
    expect(restored.currentTotal).toBe(9)
    const tampered = serializeNumberGemState(state).replace('"currentTotal":9', '"currentTotal":8')
    expect(() => deserializeNumberGemState(tampered)).toThrow('驗證失敗')
  })
})
