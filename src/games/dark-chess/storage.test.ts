import { describe, expect, it } from 'vitest'
import { createDarkChessState, deserializeDarkChessState, serializeDarkChessState } from './rules'
import { indexedDbDarkChessStorage, type DarkChessSession } from './storage'

describe('台灣暗棋存檔資料契約', () => {
  it('保留種子、完整隱藏局面與教學／冒險欄位，並可用回放驗證局面', () => {
    const state = createDarkChessState(123)
    const session: DarkChessSession = {
      difficulty: 'challenge',
      hintLevel: 2,
      seed: state.seed,
      state,
      tutorialStep: 4,
      adventureProgress: {
        selectedLevelId: 'dark-chess-intro',
        completedLevelIds: ['dark-chess-flip'],
      },
    }
    const restored = deserializeDarkChessState(serializeDarkChessState(session.state))

    expect(restored).toEqual(state)
    expect(session.seed).toBe(restored.seed)
    expect(session.adventureProgress?.completedLevelIds).toEqual(['dark-chess-flip'])
  })

  it('沒有 IndexedDB 時不阻斷遊戲，讀取回傳空值', async () => {
    expect(await indexedDbDarkChessStorage.load('local')).toBeNull()
  })
})
