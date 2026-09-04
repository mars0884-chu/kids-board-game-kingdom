import { describe, expect, it } from 'vitest'
import { chooseGomokuMove } from './ai'
import { createGomokuState, replayGomokuMoves } from './rules'

const at = (row: number, column: number): number => row * 15 + column

describe('五子棋兒童友善自適應難度', () => {
  it('相同局面、難度與種子會得到相同合法落點', () => {
    const state = createGomokuState()

    expect(chooseGomokuMove(state, 'beginner', 20260810)).toBe(
      chooseGomokuMove(state, 'beginner', 20260810),
    )
  })

  it('成長級以上會優先完成自己的五子', () => {
    const state = replayGomokuMoves([
      at(7, 3), at(0, 0),
      at(7, 4), at(0, 2),
      at(7, 5), at(0, 4),
      at(7, 6), at(0, 6),
    ])

    expect([at(7, 2), at(7, 7)]).toContain(chooseGomokuMove(state, 'growth', 1))
  })

  it('成長級會先阻擋對手下一手能連成五子的落點', () => {
    const state = replayGomokuMoves([
      at(0, 0), at(7, 3),
      at(0, 2), at(7, 4),
      at(1, 0), at(7, 5),
      at(1, 2), at(7, 6),
    ])

    expect([at(7, 2), at(7, 7)]).toContain(chooseGomokuMove(state, 'growth', 1))
  })

  it('挑戰級以上會優先阻擋對手的立即勝勢', () => {
    const state = replayGomokuMoves([
      at(0, 0), at(7, 3),
      at(0, 2), at(7, 4),
      at(1, 0), at(7, 5),
      at(1, 2), at(7, 6),
    ])

    expect([at(7, 2), at(7, 7)]).toContain(chooseGomokuMove(state, 'challenge', 1))
  })
})
