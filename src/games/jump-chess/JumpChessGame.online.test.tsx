import { useEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JumpChessGame } from './JumpChessGame'

const mocks = vi.hoisted(() => {
  const connection = Object.assign(new EventTarget(), { connectionState: 'connected' }) as unknown as RTCPeerConnection
  const channel = Object.assign(new EventTarget(), {
    readyState: 'open',
    send: vi.fn(),
    close: vi.fn(),
  }) as unknown as RTCDataChannel
  return { connection, channel }
})

vi.mock('../../online/WebRtcPairing', () => ({
  WebRtcPairing: ({ onConnected }: { onConnected: (session: unknown) => void }) => {
    useEffect(() => {
      onConnected({ sessionId: 'disconnect-test-session', role: 'host', connection: mocks.connection, channel: mocks.channel })
    }, [onConnected])
    return <div data-testid="online-pairing" />
  },
}))

vi.mock('../../online/webrtc', () => ({ closeWebRtcPeerSession: vi.fn() }))

describe('跳棋線上斷線保留局面', () => {
  it('斷線後保留棋盤並在緩衝時間後鎖定棋孔', async () => {
    const { container } = render(<JumpChessGame mode="online" onBack={vi.fn()} />)
    await waitFor(() => expect(container.querySelector('.jump-chess-board')).toBeInTheDocument())

    Object.defineProperty(mocks.connection, 'connectionState', { value: 'disconnected', configurable: true })
    mocks.connection.dispatchEvent(new Event('connectionstatechange'))

    await waitFor(() => expect(container.querySelector('.feedback-card__message')).toHaveAttribute('aria-label', '連線中斷，棋局先留在這裡'), { timeout: 6_500 })
    expect(container.querySelectorAll('.jump-chess-piece')).toHaveLength(20)
    expect((container.querySelector('.jump-chess-hole') as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('.jump-chess-game__turn-count strong')).toHaveTextContent('0')
  })
})
