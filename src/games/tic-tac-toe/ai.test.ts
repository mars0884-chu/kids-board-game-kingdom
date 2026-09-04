import { describe, expect, it } from 'vitest'
import { chooseTicTacToeMove, type TicTacToeDifficulty } from './ai'
import {
  createTicTacToeState,
  getLegalTicTacToeMoves,
  playTicTacToeMove,
  replayTicTacToeMoves,
  type TicTacToeState,
} from './rules'

const DIFFICULTIES: readonly TicTacToeDifficulty[] = ['beginner', 'growth', 'challenge', 'adult']

describe('井字棋四階 NPC', () => {
  it('四階在各種代表局面都只選合法空格', () => {
    const states = [
      createTicTacToeState(),
      replayTicTacToeMoves([0]),
      replayTicTacToeMoves([0, 4, 8]),
      replayTicTacToeMoves([4, 0, 2, 6]),
    ]

    for (const state of states) {
      for (const difficulty of DIFFICULTIES) {
        expect(getLegalTicTacToeMoves(state)).toContain(chooseTicTacToeMove(state, difficulty, 20260804))
      }
    }
  })

  it('四階看見一步可完成的連線時都會獲勝', () => {
    const state = replayTicTacToeMoves([0, 3, 1, 4])

    for (const difficulty of DIFFICULTIES) {
      expect(chooseTicTacToeMove(state, difficulty, 17)).toBe(2)
    }
  })

  it('成長級會優先阻擋對手的一步勝局', () => {
    const state = replayTicTacToeMoves([0, 4, 1])

    expect(chooseTicTacToeMove(state, 'growth', 17)).toBe(2)
  })

  it('相同局面、難度與種子會重現相同選擇', () => {
    const state = replayTicTacToeMoves([4])

    for (const difficulty of DIFFICULTIES) {
      const first = chooseTicTacToeMove(state, difficulty, 314159)
      const second = chooseTicTacToeMove(state, difficulty, 314159)
      expect(second).toBe(first)
    }
  })

  it('終局不再選棋，非整數種子會被拒絕', () => {
    const won = replayTicTacToeMoves([0, 3, 1, 4, 2])

    expect(chooseTicTacToeMove(won, 'adult', 1)).toBeNull()
    expect(() => chooseTicTacToeMove(createTicTacToeState(), 'adult', 1.5)).toThrow('種子必須是整數')
  })

  it('成人版擔任後手時，兒童無法從空棋盤強迫它落敗', () => {
    function canFirstPlayerForceWin(state: TicTacToeState): boolean {
      if (state.phase !== 'playing') {
        return state.winner === 'x'
      }

      if (state.currentPlayer === 'x') {
        return getLegalTicTacToeMoves(state).some((move) => canFirstPlayerForceWin(playTicTacToeMove(state, move)))
      }

      const npcMove = chooseTicTacToeMove(state, 'adult', 20260804 + state.moves.length)
      if (npcMove === null) {
        return false
      }
      return canFirstPlayerForceWin(playTicTacToeMove(state, npcMove))
    }

    expect(canFirstPlayerForceWin(createTicTacToeState())).toBe(false)
  })
})
