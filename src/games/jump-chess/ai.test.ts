import { describe, expect, it } from 'vitest'
import { applyJumpChessNpcTurn, chooseJumpChessTurn } from './ai'
import { applyJumpChessMove, createJumpChessState, createJumpChessStateFromPieces, finishJumpChessTurn, getLegalJumpMoves } from './rules'

describe('跳棋兒童友善自適應難度 NPC', () => {
  it('四階難度都只產生規則核心允許的完整回合', () => {
    for (const difficulty of ['beginner', 'growth', 'challenge', 'adult'] as const) {
      const baseState = createJumpChessState()
      const state = createJumpChessStateFromPieces(baseState.initialPieces, 'player2')
      const plan = chooseJumpChessTurn(state, difficulty, 20260901)
      expect(plan.length).toBeGreaterThan(0)
      let next = state
      for (const move of plan) {
        expect(getLegalJumpMoves(next)).toContainEqual(move)
        next = applyJumpChessMove(next, move)
      }
      if (next.activeJump !== null) next = finishJumpChessTurn(next)
      expect(next.turns).toHaveLength(1)
      expect(next.currentPlayer).toBe('player1')
    }
  })

  it('相同種子與局面會重現 NPC 走法', () => {
    const baseState = createJumpChessState()
    const state = createJumpChessStateFromPieces(baseState.initialPieces, 'player2')
    expect(chooseJumpChessTurn(state, 'challenge', 77)).toEqual(chooseJumpChessTurn(state, 'challenge', 77))
  })

  it('NPC 完整回合會結束連跳，不留下半回合狀態', () => {
    const baseState = createJumpChessState()
    const state = createJumpChessStateFromPieces(baseState.initialPieces, 'player2')
    const next = applyJumpChessNpcTurn(state, 'adult', 31)
    expect(next.activeJump).toBeNull()
    expect(next.turns).toHaveLength(1)
    expect(next.currentPlayer).toBe('player1')
  })
})
