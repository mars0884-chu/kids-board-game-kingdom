import { describe, expect, it } from 'vitest'
import { shouldClaimPairingCandidate } from './firebase-pairing'
import { createPairingMatchId, pairingLockPath } from './pairing-locks'

describe('Firebase 隨機配對角色選擇', () => {
  it('同一對票號只允許排序較前的一端主動配對', () => {
    expect(shouldClaimPairingCandidate('ticket-a', 'ticket-b')).toBe(true)
    expect(shouldClaimPairingCandidate('ticket-b', 'ticket-a')).toBe(false)
  })

  it('不允許自己把自己當成候選玩家', () => {
    expect(shouldClaimPairingCandidate('ticket-a', 'ticket-a')).toBe(false)
  })
  it('用固定票號產生唯一且可重現的配對鎖與 match 識別碼', () => {
    expect(createPairingMatchId('ticket-a', 'ticket-b')).toBe('match-ticket-a-ticket-b')
    expect(createPairingMatchId('ticket-a', 'ticket-b')).toBe(createPairingMatchId('ticket-a', 'ticket-b'))
    expect(pairingLockPath('ticket-a')).toBe('pairing/locks/ticket-a')
  })
})
