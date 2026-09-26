import { describe, expect, it } from 'vitest'
import { isOnlineGameId, matchesOnlineGame, onlineGameIds } from './game-id'

describe('線上房間棋種隔離', () => {
  it('八款已列棋種各有唯一識別', () => {
    expect(new Set(onlineGameIds).size).toBe(8)
    for (const id of onlineGameIds) expect(isOnlineGameId(id)).toBe(true)
    expect(isOnlineGameId('unknown')).toBe(false)
  })

  it('不同棋種不得相互配對', () => {
    for (const own of onlineGameIds) {
      for (const candidate of onlineGameIds) {
        expect(matchesOnlineGame(candidate, own)).toBe(candidate === own)
      }
    }
  })

  it('舊版無棋種房間只相容跳棋', () => {
    expect(matchesOnlineGame(undefined, 'jump-chess')).toBe(true)
    expect(matchesOnlineGame(undefined, 'dark-chess')).toBe(false)
  })
})
