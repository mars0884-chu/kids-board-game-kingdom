import { describe, expect, it } from 'vitest'
import { REVERSI_AI_PROFILES, chooseReversiMove } from './ai'
import { REVERSI_BOARD_CELLS, REVERSI_BOARD_SIZE, createReversiState, getLegalReversiMoves, replayReversiMoves, type ReversiCell, type ReversiState } from './rules'

function stateWith(board: readonly ReversiCell[]): ReversiState {
  return {
    version: 1,
    boardSize: REVERSI_BOARD_SIZE,
    startingPlayer: 'black',
    board,
    currentPlayer: 'black',
    phase: 'playing',
    winner: null,
    blackCount: board.filter((cell) => cell === 'black').length,
    whiteCount: board.filter((cell) => cell === 'white').length,
    consecutivePasses: 0,
    turns: [],
  }
}

describe('黑白棋四階 NPC', () => {
  it('四個難度都只會回傳目前合法的落子', () => {
    const state = createReversiState()
    for (const difficulty of ['beginner', 'growth', 'challenge', 'adult'] as const) {
      const move = chooseReversiMove(state, difficulty, 20260815)
      expect(move).not.toBeNull()
      expect(getLegalReversiMoves(state)).toContain(move)
    }
  })

  it('成長、挑戰與成人版會優先取得可得角落', () => {
    const board = Array<ReversiCell>(REVERSI_BOARD_CELLS).fill(null)
    board[1] = 'white'
    board[2] = 'black'
    const state = stateWith(board)

    for (const difficulty of ['growth', 'challenge', 'adult'] as const) {
      expect(chooseReversiMove(state, difficulty, 7)).toBe(0)
    }
  })

  it('固定種子可重播，成人版在互動等待時間內完成', () => {
    const state = replayReversiMoves([19, 18, 17, 9, 1, 0])
    const startedAt = performance.now()
    const first = chooseReversiMove(state, 'adult', 20260815)
    const elapsed = performance.now() - startedAt

    expect(first).toBe(chooseReversiMove(state, 'adult', 20260815))
    expect(elapsed).toBeLessThan(600)
  })

  it('固定四階邊界，並以固定局面驗證策略行為有區隔', () => {
    expect(REVERSI_AI_PROFILES.challenge).toMatchObject({ searchDepth: 1, branchLimit: 8 })
    expect(REVERSI_AI_PROFILES.adult).toMatchObject({ searchDepth: 2, branchLimit: 6 })

    const opening = createReversiState()
    expect(chooseReversiMove(opening, 'beginner', 20260815)).not.toBe(
      chooseReversiMove(opening, 'growth', 20260815),
    )

    const midgame = replayReversiMoves([44, 43, 50, 21, 26, 52, 29, 37])
    expect(chooseReversiMove(midgame, 'challenge', 20260815)).not.toBe(
      chooseReversiMove(midgame, 'adult', 20260815),
    )
  })
})
