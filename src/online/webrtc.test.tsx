import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WebRtcPairing } from './WebRtcPairing'
import {
  WEBRTC_SIGNAL_MAX_AGE_MS,
  createWebRtcSignalLink,
  decodeWebRtcSignal,
  encodeWebRtcSignal,
  readWebRtcSignal,
  type WebRtcSignal,
} from './webrtc'

const offer: WebRtcSignal = {
  protocol: 'kids-board-game-webrtc',
  version: 1,
  sessionId: 'test-session-1234',
  kind: 'offer',
  createdAt: Date.now(),
  description: { type: 'offer', sdp: 'v=0\r\no=- test' },
}

describe('WebRTC 手動連線資料', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, value: undefined })
  })

  it('可以把邀請資料編碼後再完整還原', () => {
    const encoded = encodeWebRtcSignal(offer)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(decodeWebRtcSignal(encoded)).toEqual(offer)
  })

  it('拒絕過期連線資料', () => {
    const encoded = encodeWebRtcSignal({ ...offer, createdAt: Date.now() - WEBRTC_SIGNAL_MAX_AGE_MS - 1 })
    expect(decodeWebRtcSignal(encoded)).toBeNull()
  })

  it('連線網址只保留短期 WebRTC 資料，不保留原本的查詢參數', () => {
    const location = new URL('https://example.test/game?preview=jump-chess-online') as unknown as Location
    const link = createWebRtcSignalLink(offer, location)
    const parsedLocation = new URL(link) as unknown as Location
    expect(new URL(link).searchParams.has('preview')).toBe(false)
    expect(readWebRtcSignal(parsedLocation)).toEqual(offer)
  })

  it('瀏覽器不支援直連時顯示清楚的兒童提示', () => {
    render(<WebRtcPairing onBack={vi.fn()} onConnected={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '兩台裝置連線' })).toBeInTheDocument()
    const statusText = screen.getByRole('status').textContent?.replace(/（[^）]*）/g, '')
    expect(statusText).toBe('這台裝置不能直連')
  })
})
