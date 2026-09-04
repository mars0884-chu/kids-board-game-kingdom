import { describe, expect, it } from 'vitest'
import {
  REVERSI_ADVENTURE_LEVELS,
  createReversiAdventureState,
  getReversiAdventureLevel,
  isReversiAdventureMoveCorrect,
} from './adventure'
import { getLegalReversiMoves } from './rules'

describe('黑白棋六個互動教學關卡', () => {
  it('每關都能由固定局面重播，並保留可操作的合法落子', () => {
    for (const level of REVERSI_ADVENTURE_LEVELS) {
      const state = createReversiAdventureState(level)
      expect(state.phase).toBe('playing')
      expect(getLegalReversiMoves(state).length).toBeGreaterThan(0)
    }
  })

  it('逐關驗證單線、多方向、角落與自動略過教學目標', () => {
    const opening = getReversiAdventureLevel('opening')
    const openingState = createReversiAdventureState(opening)
    expect(getLegalReversiMoves(openingState)).toEqual([19, 26, 37, 44])

    const single = getReversiAdventureLevel('single-line')
    const singleState = createReversiAdventureState(single)
    expect(getLegalReversiMoves(singleState)).toEqual([17])
    expect(isReversiAdventureMoveCorrect(single, singleState, 17)).toBe(true)
    expect(isReversiAdventureMoveCorrect(single, singleState, 18)).toBe(false)

    const multiple = getReversiAdventureLevel('multiple-directions')
    const multipleState = createReversiAdventureState(multiple)
    expect(isReversiAdventureMoveCorrect(multiple, multipleState, 26)).toBe(true)
    expect(isReversiAdventureMoveCorrect(multiple, multipleState, 18)).toBe(false)

    const corner = getReversiAdventureLevel('protect-corner')
    expect(isReversiAdventureMoveCorrect(corner, createReversiAdventureState(corner), 56)).toBe(true)

    const forcedPass = getReversiAdventureLevel('forced-pass')
    const forcedPassState = createReversiAdventureState(forcedPass)
    expect(forcedPassState.turns.at(-1)).toMatchObject({ kind: 'pass', player: 'white' })
    expect(getLegalReversiMoves(forcedPassState)).toEqual([54, 55, 63])
  })
})
