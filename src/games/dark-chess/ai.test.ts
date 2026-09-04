import { describe, expect, it } from 'vitest'
import {
  DARK_CHESS_AI_PROFILES,
  chooseDarkChessAction,
} from './ai'
import {
  applyDarkChessAction,
  createDarkChessState,
  getLegalPublicDarkChessActions,
  getPublicDarkChessState,
} from './rules'

describe('台灣暗棋公開資訊 NPC', () => {
  it('固定四階難度：挑戰一層八候選，成人版兩層六候選', () => {
    expect(DARK_CHESS_AI_PROFILES).toEqual({
      beginner: { strategy: 'gentle', searchDepth: 0, branchLimit: 3 },
      growth: { strategy: 'growth', searchDepth: 0, branchLimit: 2 },
      challenge: { strategy: 'search', searchDepth: 1, branchLimit: 8 },
      adult: { strategy: 'search', searchDepth: 2, branchLimit: 6 },
    })
  })

  it('只依公開棋面決策：不同隱藏洗牌在相同公開局面與種子下不改變行動', () => {
    const first = createDarkChessState(101)
    const second = createDarkChessState(202)
    expect(getPublicDarkChessState(first)).toEqual(getPublicDarkChessState(second))

    for (const difficulty of ['beginner', 'growth', 'challenge', 'adult'] as const) {
      expect(chooseDarkChessAction(first, difficulty, 77)).toEqual(chooseDarkChessAction(second, difficulty, 77))
    }
  })

  it('NPC 行動一定落在公開合法行動內，不把暗棋種類當成可見資訊', () => {
    let state = createDarkChessState(303)
    const flip = chooseDarkChessAction(state, 'challenge', 7)
    expect(flip).not.toBeNull()
    expect(getLegalPublicDarkChessActions(getPublicDarkChessState(state))).toContainEqual(flip)
    state = applyDarkChessAction(state, flip!)

    const action = chooseDarkChessAction(state, 'adult', 8)
    expect(action).not.toBeNull()
    expect(getLegalPublicDarkChessActions(getPublicDarkChessState(state))).toContainEqual(action)
  })

  it('NPC 提和回應沿用 40 步門檻', () => {
    const state = {
      ...createDarkChessState(404),
      quietStreak: 40,
      drawOffer: { from: 'player1' as const },
      currentPlayer: 'player2' as const,
      playerColors: { player1: 'red' as const, player2: 'black' as const },
    }
    expect(chooseDarkChessAction(state, 'beginner', 1)).toEqual({ kind: 'draw-response', response: 'accept' })
  })
})
