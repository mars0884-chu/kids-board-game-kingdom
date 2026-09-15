import { describe, expect, it } from 'vitest'
import { isLegalOnlineTransition } from './firebase-game'
import { createJumpChessState, applyJumpChessMove, getLegalJumpMoves } from '../games/jump-chess/rules'

describe('Firebase 棋步轉移驗證', () => {
  it('只接受當前玩家的一步合法走棋', () => {
    const state = createJumpChessState()
    const next = applyJumpChessMove(state, getLegalJumpMoves(state)[0]!)
    expect(isLegalOnlineTransition(state, next, 'host')).toBe(true)
    expect(isLegalOnlineTransition(state, next, 'guest')).toBe(false)
  })
  it('拒絕跳過多步或改寫棋局結果', () => {
    const state = createJumpChessState()
    expect(isLegalOnlineTransition(state, { ...state, winner: 'player2', phase: 'won' }, 'guest')).toBe(false)
  })
  it('只有甲可以重開初始棋局', () => {
    const state = createJumpChessState()
    const next = applyJumpChessMove(state, getLegalJumpMoves(state)[0]!)
    expect(isLegalOnlineTransition(next, state, 'host')).toBe(true)
    expect(isLegalOnlineTransition(next, state, 'guest')).toBe(false)
  })
})
