import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FirebaseFriendPairing } from './FirebaseFriendPairing'
const mocks = vi.hoisted(() => ({ create: vi.fn(), join: vi.fn(), cancel: vi.fn() }))
vi.mock('./firebase-friend', () => ({
  isFriendRoomCode: (value: string) => /^\d{12}$/.test(value.replace(/\s/g, '')),
  readFriendInvite: () => new URLSearchParams(window.location.hash.slice(1)).get('friend'),
  createFriendInvitation: mocks.create, joinFriendInvitation: mocks.join,
}))
vi.mock('./FirebaseRandomPairing', () => ({ FirebaseRandomPairing: () => <div>隨機測試</div> }))
beforeEach(() => {
  vi.clearAllMocks()
  history.replaceState(null, '', '/')
  mocks.cancel.mockResolvedValue(undefined)
})
describe('熟人單次邀請介面', () => {
  it('井字棋房號傳入棋種與對應棋局工廠，不會誤接跳棋', async () => {
    const factory = vi.fn()
    mocks.join.mockResolvedValue({ transport: 'firebase-turn', gameId: 'tic-tac-toe', close: vi.fn() })
    const connected = vi.fn()
    render(<FirebaseFriendPairing gameId="tic-tac-toe" roomFactory={factory} onBack={vi.fn()} onConnected={connected} />)
    fireEvent.click(screen.getByRole('button', { name: '輸入房號' }))
    fireEvent.change(screen.getByRole('textbox', { name: '房號' }), { target: { value: '123456789012' } })
    fireEvent.click(screen.getByRole('button', { name: '加入遊戲' }))
    await waitFor(() => expect(connected).toHaveBeenCalledOnce())
    expect(mocks.join.mock.calls[0]![3]).toBe('tic-tac-toe')
    expect(mocks.join.mock.calls[0]![4]).toBe(factory)
  })
  it('在遊戲內輸入房號即可加入，不需要開啟外部連結', async () => {
    mocks.join.mockResolvedValue({ transport: 'firebase', close: vi.fn() })
    const connected = vi.fn()
    render(<FirebaseFriendPairing onBack={vi.fn()} onConnected={connected} />)
    fireEvent.click(screen.getByRole('button', { name: '輸入房號' }))
    expect(screen.getByRole('button', { name: '加入遊戲' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: '房號' }), { target: { value: '1234 5678 9012' } })
    fireEvent.click(screen.getByRole('button', { name: '加入遊戲' }))
    await waitFor(() => expect(connected).toHaveBeenCalledOnce())
    expect(mocks.join.mock.calls[0]![0]).toBe('1234 5678 9012')
    expect(window.location.hash).toBe('')
  })
  it('只分享一次，雙方就緒後交接棋局，卸載不取消成功棋局', async () => {
    let ready!: (session: unknown) => void
    const session = { transport: 'firebase', close: vi.fn() }
    mocks.create.mockResolvedValue({ link: 'https://example.test/#friend=id', cancel: mocks.cancel,
      waitForGuest: () => new Promise((resolve) => { ready = resolve }) })
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    const connected = vi.fn()
    const { unmount } = render(<FirebaseFriendPairing onBack={vi.fn()} onConnected={connected} />)
    fireEvent.click(screen.getByRole('button', { name: '邀請朋友' }))
    fireEvent.click(await screen.findByRole('button', { name: '分享邀請連結' }))
    await waitFor(() => expect(share).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: '一鍵回覆給甲' })).toBeNull()
    await act(async () => ready(session))
    expect(connected).toHaveBeenCalledWith(session)
    unmount()
    expect(mocks.cancel).not.toHaveBeenCalled()
  })
  it('乙開啟連結不自動佔位，點加入才連線', async () => {
    history.replaceState(null, '', '/#friend=abc')
    mocks.join.mockResolvedValue({ transport: 'firebase', close: vi.fn() })
    const connected = vi.fn()
    render(<FirebaseFriendPairing onBack={vi.fn()} onConnected={connected} />)
    expect(mocks.join).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '隨機配對' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '加入遊戲' }))
    await waitFor(() => expect(connected).toHaveBeenCalledOnce())
    expect(mocks.join.mock.calls[0]![0]).toBe('abc')
    expect(window.location.hash).toBe('')
  })
  it('過期後可重新邀請，移除原邀請而非重用已失效連結', async () => {
    history.replaceState(null, '', '/#friend=expired')
    mocks.join.mockRejectedValue(new Error('邀請已過期。'))
    render(<FirebaseFriendPairing onBack={vi.fn()} onConnected={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '加入遊戲' }))
    fireEvent.click(await screen.findByRole('button', { name: '重新邀請' }))
    expect(screen.getByRole('button', { name: '邀請朋友' })).toBeInTheDocument()
    expect(window.location.hash).toBe('')
  })
  it('返回會取消等待，不讓晚到的回覆帶回棋局', async () => {
    let ready!: (session: unknown) => void
    mocks.create.mockResolvedValue({ link: 'test', cancel: mocks.cancel,
      waitForGuest: () => new Promise((resolve) => { ready = resolve }) })
    const connected = vi.fn(), back = vi.fn(), close = vi.fn()
    render(<FirebaseFriendPairing onBack={back} onConnected={connected} />)
    fireEvent.click(screen.getByRole('button', { name: '邀請朋友' }))
    await screen.findByRole('button', { name: '分享邀請連結' })
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    await act(async () => ready({ close }))
    expect(back).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(connected).not.toHaveBeenCalled()
    expect(mocks.cancel).toHaveBeenCalledOnce()
  })
  it('舊版回覆連結不能默認成新房主', () => {
    history.replaceState(null, '', '/?webrtc=old')
    render(<FirebaseFriendPairing onBack={vi.fn()} onConnected={vi.fn()} />)
    expect(screen.getByRole('button', { name: '重新邀請' })).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
