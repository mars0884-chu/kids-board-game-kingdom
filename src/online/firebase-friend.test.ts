import { describe, expect, it } from 'vitest'
import { createFriendRoomCode, isFriendRoomCode, normalizeFriendCode, isFriendInviteId } from './firebase-friend'

describe('私人房號格式', () => {
  it('產生十二位數並保留前導零，不使用連號', () => {
    const codes = Array.from({ length: 100 }, () => createFriendRoomCode())
    expect(codes.every(code => /^\d{12}$/.test(code))).toBe(true)
    expect(new Set(codes).size).toBe(100)
  })
  it('接受分組、全形數字，不接受不完整或路徑字元', () => {
    expect(normalizeFriendCode('００１２ ３４５６-７８９０')).toBe('001234567890')
    expect(isFriendRoomCode('００１２ ３４５６-７８９０')).toBe(true)
    expect(isFriendRoomCode('123456')).toBe(false)
    expect(isFriendRoomCode('1234/56789012')).toBe(false)
    expect(isFriendInviteId('https://example.com')).toBe(false)
    expect(isFriendInviteId('12345678-1234-4123-8123-123456789012')).toBe(true)
  })
})
