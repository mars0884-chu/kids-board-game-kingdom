import { describe, expect, it } from 'vitest'
import {
  XIANGQI_TUTORIAL_LEVELS,
  createXiangqiTutorialState,
  getXiangqiTutorialSolutions,
  isCorrectXiangqiTutorialMove,
} from './adventure'
import { getLegalMovesFrom, isInCheck } from './rules'
import { getChildText } from '../../content/child-text'

describe('象棋六段互動教學', () => {
  it('第四段明確教會士仕九宮內斜走一格，將帥九宮內直走一格', () => {
    const lesson = getChildText('xiangqi.lesson_4_instruction')

    expect(lesson.text_zh_tw).toBe('仕士只在九宮內斜走一格；將帥只在九宮內直走一格')
    expect(lesson.speech_zh_tw).toBe('仕士只在九宮內斜走一格。將帥只在九宮內直走一格。')
    expect(getXiangqiTutorialSolutions(XIANGQI_TUTORIAL_LEVELS[3]!.tasks[0]!)).toContainEqual({ from: 8 * 9 + 3, to: 7 * 9 + 4 })
  })

  it('依規格提供六段、九個可重玩的實作練習', () => {
    expect(XIANGQI_TUTORIAL_LEVELS).toHaveLength(6)
    expect(XIANGQI_TUTORIAL_LEVELS.map((level) => level.tasks.length)).toEqual([1, 2, 2, 2, 1, 1])
    for (const [levelIndex, level] of XIANGQI_TUTORIAL_LEVELS.entries()) {
      for (const [taskIndex, task] of level.tasks.entries()) {
        const state = createXiangqiTutorialState(levelIndex, taskIndex)
        expect(state.board).toHaveLength(90)
        expect(state.board.some((piece) => piece?.owner === 'red' && piece.kind === 'king')).toBe(true)
        expect(state.board.some((piece) => piece?.owner === 'black' && piece.kind === 'king')).toBe(true)
        for (const solution of getXiangqiTutorialSolutions(task)) {
          expect(getLegalMovesFrom(state, solution.from).some((move) => move.to === solution.to), `${level.id}/${task.id}: ${solution.from}->${solution.to}`).toBe(true)
          expect(isCorrectXiangqiTutorialMove(state, task, solution.from, solution.to), `${level.id}/${task.id}: expected move`).toBe(true)
        }
      }
    }
  })

  it('以馬腳、象眼、炮架與九宮的真實規則局面出題', () => {
    const horse = createXiangqiTutorialState(2, 0)
    expect(getLegalMovesFrom(horse, 5 * 9 + 2)).toContainEqual(expect.objectContaining({ to: 3 * 9 + 3 }))

    const elephant = createXiangqiTutorialState(2, 1)
    expect(getLegalMovesFrom(elephant, 7 * 9 + 2)).toContainEqual(expect.objectContaining({ to: 5 * 9 + 0 }))

    const cannon = createXiangqiTutorialState(1, 1)
    expect(getLegalMovesFrom(cannon, 5 * 9 + 0)).toContainEqual(expect.objectContaining({ to: 5 * 9 + 3 }))

    const king = createXiangqiTutorialState(3, 1)
    expect(getLegalMovesFrom(king, 9 * 9 + 4)).toContainEqual(expect.objectContaining({ to: 8 * 9 + 4 }))
  })

  it('答錯時不會被判為正解，將軍題只接受合法的解圍步', () => {
    const level = XIANGQI_TUTORIAL_LEVELS[5]!
    const task = level.tasks[0]!
    const state = createXiangqiTutorialState(5, 0)
    expect(isInCheck(state, 'red')).toBe(true)
    expect(getXiangqiTutorialSolutions(task)).toHaveLength(2)
    expect(isCorrectXiangqiTutorialMove(state, task, 9 * 9 + 4, 8 * 9 + 3)).toBe(false)
    expect(getLegalMovesFrom(state, task.from).some((move) => move.to === 8 * 9 + 3)).toBe(false)
  })
})
