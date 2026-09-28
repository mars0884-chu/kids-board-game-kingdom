import { describe, expect, it } from 'vitest'
import { chooseGoMove } from './ai'
import { createGoState, getLegalGoMoves, playGoMove } from './rules'

describe('圍棋 NPC', () => {
  it('每階都只選擇規則核心認可的落點', () => {
    const state = playGoMove(createGoState(9), 40)
    for (const difficulty of ['beginner', 'growth', 'challenge', 'adult'] as const) {
      expect(getLegalGoMoves(state)).toContain(chooseGoMove(state, difficulty, 901))
    }
  })

  it('相同局面、難度與種子可重現', () => {
    const state = createGoState(13)
    expect(chooseGoMove(state, 'challenge', 20260928)).toBe(chooseGoMove(state, 'challenge', 20260928))
  })

  it('終局狀態不再選步', () => {
    let state = createGoState(9)
    state = playGoMove(state, 40)
    state = { ...state, phase: 'finished' }
    expect(chooseGoMove(state, 'adult', 4)).toBeNull()
  })
})
