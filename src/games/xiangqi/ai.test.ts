import { describe, expect, it } from 'vitest'
import { chooseXiangqiMove, type XiangqiDifficulty } from './ai'
import { applyMove, createInitialXiangqiState, getLegalMoves } from './rules'

describe('象棋四階 NPC', () => {
  const levels: XiangqiDifficulty[] = ['beginner', 'growth', 'challenge', 'adult']
  it.each(levels)('%s 只選合法步，固定種子可重播且不改動局面', level => {
    const initial = createInitialXiangqiState()
    const before = JSON.stringify(initial)
    const move = chooseXiangqiMove(initial, level, 1234)
    expect(move).not.toBeNull()
    expect(getLegalMoves(initial)).toContainEqual(move)
    expect(chooseXiangqiMove(initial, level, 1234)).toEqual(move)
    expect(JSON.stringify(initial)).toBe(before)
    expect(applyMove(initial, move!.from, move!.to).currentPlayer).toBe('black')
  })
})
