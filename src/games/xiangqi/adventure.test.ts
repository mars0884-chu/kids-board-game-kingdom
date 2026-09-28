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
    expect(getXiangqiTutorialSolutions(XIANGQI_TUTORIAL_LEVELS[3]!.tasks[0]!)).toContainEqual({ from: 9 * 9 + 3, to: 8 * 9 + 4 })
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

  it('車從標準起點橫直走多格且不能越過己方棋子', () => {
    const chariot = createXiangqiTutorialState(1, 0)
    expect(chariot.board[9 * 9]?.kind).toBe('chariot')
    expect(chariot.board[9 * 9]?.owner).toBe('red')
    const moves = getLegalMovesFrom(chariot, 9 * 9)
    expect(moves).toContainEqual(expect.objectContaining({ to: 9 * 9 + 3 }))
    expect(moves).toContainEqual(expect.objectContaining({ to: 7 * 9 }))
    expect(moves).not.toContainEqual(expect.objectContaining({ to: 5 * 9 }))
    expect(getXiangqiTutorialSolutions(XIANGQI_TUTORIAL_LEVELS[1]!.tasks[0]!)).toHaveLength(2)
  })

  it('士仕示範從雙方九宮標準起點斜走一格', () => {
    const state = createXiangqiTutorialState(3, 0)
    expect(state.board[9 * 9 + 3]).toMatchObject({ owner: 'red', kind: 'advisor' })
    expect(state.board[0 * 9 + 3]).toMatchObject({ owner: 'black', kind: 'advisor' })
    expect(getLegalMovesFrom(state, 9 * 9 + 3)).toContainEqual(expect.objectContaining({ to: 8 * 9 + 4 }))
    expect(getLegalMovesFrom(state, 9 * 9 + 3)).not.toContainEqual(expect.objectContaining({ to: 8 * 9 + 2 }))
    expect(getLegalMovesFrom(state, 0 * 9 + 3, 'black')).toContainEqual(expect.objectContaining({ to: 1 * 9 + 4 }))
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
