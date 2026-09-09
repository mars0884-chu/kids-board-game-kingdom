import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WebRtcPairing } from './WebRtcPairing'
import {
  WEBRTC_SIGNAL_MAX_AGE_MS,
  WEBRTC_ICE_SERVERS,
  WEBRTC_CONNECTION_TIMEOUT_MS,
  WEBRTC_ICE_GATHERING_TIMEOUT_MS,
  WEBRTC_PEER_READY_TIMEOUT_MS,
  WEBRTC_PEER_READY_RETRY_MS,
  createWebRtcSignalLink,
  decodeWebRtcSignal,
  encodeWebRtcSignal,
  hasWebRtcSignalParameter,
  publishWebRtcAnswerToHost,
  readWebRtcSignal,
  waitForWebRtcChannel,
  waitForWebRtcPeerReady,
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

const answer: WebRtcSignal = {
  ...offer,
  kind: 'answer',
  description: { type: 'answer', sdp: 'v=0\\r\\no=- answer' },
}

class FakeDataChannel extends EventTarget {
  readyState: RTCDataChannelState = 'open'
  readonly messages: string[] = []

  send(data: string): void {
    this.messages.push(data)
  }
}

class FakePeerConnection extends EventTarget {
  connectionState: RTCPeerConnectionState = 'new'
  iceConnectionState: RTCIceConnectionState = 'new'
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

  it('區分缺少連線參數與無效連線參數', () => {
    const baseLocation = new URL('https://example.test/game') as unknown as Location
    const invalidLocation = new URL('https://example.test/game?webrtc=broken') as unknown as Location

    expect(hasWebRtcSignalParameter(baseLocation)).toBe(false)
    expect(hasWebRtcSignalParameter(invalidLocation)).toBe(true)
    expect(readWebRtcSignal(invalidLocation)).toBeNull()
  })
  it('只使用公開 STUN 探索候選，不設定 TURN 中繼', () => {
    expect(WEBRTC_ICE_SERVERS).toEqual([{ urls: 'stun:stun.l.google.com:19302' }])
  })

  it('為手動交換預留足夠的連線準備時間', () => {
    expect(WEBRTC_ICE_GATHERING_TIMEOUT_MS).toBe(15_000)
    expect(WEBRTC_CONNECTION_TIMEOUT_MS).toBe(5 * 60 * 1000)
    expect(WEBRTC_PEER_READY_TIMEOUT_MS).toBe(5 * 60 * 1000)
  })

  it('資料通道等待期間偵測到 ICE 失敗時會立即結束等待', async () => {
    const channel = new FakeDataChannel()
    channel.readyState = 'connecting'
    const connection = new FakePeerConnection()
    const waiting = waitForWebRtcChannel(
      channel as unknown as RTCDataChannel,
      WEBRTC_CONNECTION_TIMEOUT_MS,
      connection as unknown as RTCPeerConnection,
    )

    connection.iceConnectionState = 'failed'
    connection.dispatchEvent(new Event('iceconnectionstatechange'))

    await expect(waiting).rejects.toThrow('兩台裝置的網路連線失敗。')
  })

  it('雙方就緒等待期間偵測到連線關閉時會立即結束等待', async () => {
    const channel = new FakeDataChannel()
    channel.readyState = 'open'
    const connection = new FakePeerConnection()
    const waiting = waitForWebRtcPeerReady(
      channel as unknown as RTCDataChannel,
      offer.sessionId,
      'host',
      WEBRTC_PEER_READY_TIMEOUT_MS,
      connection as unknown as RTCPeerConnection,
    )

    connection.connectionState = 'closed'
    connection.dispatchEvent(new Event('connectionstatechange'))

    await expect(waiting).rejects.toThrow('兩台裝置的網路連線失敗。')
  })
  it('雙方都回報同一局的就緒訊息後才完成配對', async () => {
    const channel = new FakeDataChannel()
    const ready = waitForWebRtcPeerReady(channel as unknown as RTCDataChannel, offer.sessionId, 'host')
    expect(channel.messages).toEqual([
      JSON.stringify({
        protocol: 'kids-board-game-webrtc-ready',
        sessionId: offer.sessionId,
        role: 'host',
        kind: 'ready',
      }),
    ])

    let completed = false
    void ready.then(() => {
      completed = true
    })
    channel.dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({
        protocol: 'kids-board-game-webrtc-ready',
        sessionId: offer.sessionId,
        role: 'host',
        kind: 'ready',
      }),
    }))
    await Promise.resolve()
    expect(completed).toBe(false)

    channel.dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({
        protocol: 'kids-board-game-webrtc-ready',
        sessionId: offer.sessionId,
        role: 'guest',
        kind: 'ready',
      }),
    }))
    await Promise.resolve()
    expect(completed).toBe(false)

    channel.dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({
        protocol: 'kids-board-game-webrtc-ready',
        sessionId: offer.sessionId,
        role: 'guest',
        kind: 'ack',
      }),
    }))

    await expect(ready).resolves.toBeUndefined()
  })
  it('對方尚未掛上監聽器時會重送就緒訊息', async () => {
    vi.useFakeTimers()
    try {
      const channel = new FakeDataChannel()
      const ready = waitForWebRtcPeerReady(channel as unknown as RTCDataChannel, offer.sessionId, 'host')
      expect(channel.messages).toHaveLength(1)

      vi.advanceTimersByTime(WEBRTC_PEER_READY_RETRY_MS)
      expect(channel.messages).toHaveLength(2)

      channel.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({
          protocol: 'kids-board-game-webrtc-ready',
          sessionId: offer.sessionId,
          role: 'guest',
          kind: 'ready',
        }),
      }))

      channel.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({
          protocol: 'kids-board-game-webrtc-ready',
          sessionId: offer.sessionId,
          role: 'guest',
          kind: 'ack',
        }),
      }))
      await expect(ready).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('無效連線網址不會被誤認為新的甲端', () => {
    Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, value: vi.fn() })
    window.history.replaceState({}, '', '/?webrtc=broken')

    render(<WebRtcPairing onBack={vi.fn()} onConnected={vi.fn()} />)

    expect(screen.getByRole('status').querySelector('.bopomofo-text')).toHaveAttribute('aria-label', '連線連結無效')
    expect(screen.queryByRole('button', { name: '隨機配對' })).not.toBeInTheDocument()
  })
  it('瀏覽器不支援直連時顯示清楚的兒童提示', () => {
    render(<WebRtcPairing onBack={vi.fn()} onConnected={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '兩台裝置連線' })).toBeInTheDocument()
    expect(screen.getByRole('status').querySelector('.bopomofo-text')).toHaveAttribute('aria-label', '這台裝置不能直連')
  })

  it('手動配對頁可以進入匿名隨機配對的家長同意頁', () => {
    render(<WebRtcPairing onBack={vi.fn()} onConnected={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '隨機配對' }))

    expect(screen.getByRole('status').querySelector('.bopomofo-text')).toHaveAttribute('aria-label', '請家長先同意')
    expect(screen.getByRole('button', { name: '家長已了解並同意' })).toBeInTheDocument()
  })
  it('回覆頁由原頁面開啟時會以同源訊息送回甲', () => {
    const postMessage = vi.fn()
    Object.defineProperty(window, 'opener', { configurable: true, value: { postMessage } })

    publishWebRtcAnswerToHost(answer)

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'kids-board-game-webrtc-answer', sessionId: answer.sessionId, signal: answer }),
      window.location.origin,
    )
  })
})
