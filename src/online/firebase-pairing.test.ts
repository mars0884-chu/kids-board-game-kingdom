import { describe, expect, it } from 'vitest'
import { shouldClaimPairingCandidate } from './firebase-pairing'

describe('Firebase 隨機配對角色選擇', () => {
  it('同一對票號只允許排序較前的一端主動配對', () => {
    expect(shouldClaimPairingCandidate('ticket-a', 'ticket-b')).toBe(true)
    expect(shouldClaimPairingCandidate('ticket-b', 'ticket-a')).toBe(false)
  })

  it('不允許自己把自己當成候選玩家', () => {
    expect(shouldClaimPairingCandidate('ticket-a', 'ticket-a')).toBe(false)
  })
})
