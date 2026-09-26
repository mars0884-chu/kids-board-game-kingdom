import { describe, expect, it } from 'vitest'
import { createFriendRoomCode, isFriendRoomCode, normalizeFriendCode, isFriendInviteId } from './firebase-friend'

describe('私人房號格式', () => {
  it('產生八位數短房號，且不使用連號', () => {
    const codes = Array.from({ length: 100 }, () => createFriendRoomCode())
    expect(codes.every(code => /^\d{8}$/.test(code))).toBe(true)
    expect(new Set(codes).size).toBe(100)
  })
  it('接受八位分組全形房號，拒絕舊十二位房號、不完整號碼與路徑字元', () => {
    expect(normalizeFriendCode('００１２ ３４５６')).toBe('00123456')
    expect(isFriendRoomCode('００１２ ３４５６')).toBe(true)
    expect(isFriendRoomCode('００１２ ３４５６-７８９０')).toBe(false)
    expect(isFriendRoomCode('123456')).toBe(false)
    expect(isFriendRoomCode('1234/5678')).toBe(false)
    expect(isFriendInviteId('https://example.com')).toBe(false)
    expect(isFriendInviteId('12345678-1234-4123-8123-123456789012')).toBe(true)
  })
})
