import { describe, expect, it } from 'vitest'
import { chooseGomokuMove } from './ai'
import { isLegalGomokuMove, replayGomokuMoves } from './rules'

const at = (row: number, column: number) => row * 15 + column

describe('五子棋四階 NPC', () => {
  it('四個難度都會回傳目前規則允許的落子', () => {
    const state = replayGomokuMoves([at(7, 7), at(6, 7)])
    for (const difficulty of ['beginner', 'growth', 'challenge', 'adult'] as const) {
      const move = chooseGomokuMove(state, difficulty, 20260810)
      expect(move).not.toBeNull()
      expect(state.board[move!]).toBeNull()
      expect(isLegalGomokuMove(state, move!)).toBe(true)
    }
  })

  it('成人級會優先走出可立即獲勝的五連', () => {
    const state = replayGomokuMoves([
      at(7, 3), at(0, 0), at(7, 4), at(0, 2),
      at(7, 5), at(0, 4), at(7, 6), at(0, 6),
    ])
    expect([at(7, 2), at(7, 7)]).toContain(chooseGomokuMove(state, 'adult', 7))
  })

  it('成長、挑戰與成人版會把自己的活三延伸為活四', () => {
    const state = replayGomokuMoves([
      at(0, 0), at(7, 4),
      at(0, 2), at(7, 5),
      at(0, 4), at(7, 6),
      at(1, 0),
    ])

    for (const difficulty of ['growth', 'challenge', 'adult'] as const) {
      expect([at(7, 3), at(7, 7)]).toContain(chooseGomokuMove(state, difficulty, 20260812))
    }
  })

  it('挑戰與成人版會阻擋對手正在形成的活三', () => {
    const state = replayGomokuMoves([
      at(7, 4), at(0, 0),
      at(7, 5), at(0, 2),
      at(7, 6), at(0, 4),
      at(1, 0),
    ])

    for (const difficulty of ['challenge', 'adult'] as const) {
      expect([at(7, 3), at(7, 7)]).toContain(chooseGomokuMove(state, difficulty, 20260812))
    }
  })

  it('成人版在固定種子下會在互動等待時間內做出可重現的決策', () => {
    const state = replayGomokuMoves([at(7, 7), at(6, 7), at(7, 8)])
    const startedAt = performance.now()
    const first = chooseGomokuMove(state, 'adult', 20260812)
    const elapsed = performance.now() - startedAt

    expect(first).toBe(chooseGomokuMove(state, 'adult', 20260812))
    expect(elapsed).toBeLessThan(600)
  })
})
