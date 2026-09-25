import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDarkChessState, getPublicDarkChessState } from './rules'
import { DarkChessOnlineGame } from './DarkChessOnlineGame'

const mocks = vi.hoisted(() => ({ session: null as unknown }))
vi.mock('../../online/FirebaseFriendPairing', () => ({
  FirebaseFriendPairing: ({ onConnected }: { onConnected: (session: unknown) => void }) =>
    <button type="button" onClick={() => onConnected(mocks.session)}>進入測試棋局</button>,
}))

const submit = vi.fn().mockResolvedValue(undefined)
const restart = vi.fn().mockResolvedValue(undefined)
const close = vi.fn()
const initial = { revision: 0, state: getPublicDarkChessState(createDarkChessState(123)) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session = {
    role: 'host', submit, restart, close,
    subscribe: (state: (view: typeof initial) => void, connected: (value: boolean) => void) => {
      state(initial); connected(true); return vi.fn()
    },
  }
})

describe('暗棋線上公開畫面', () => {
  it('全盤蓋牌不顯示顏色種類，甲只能傳行動而不是完整秘密局面', async () => {
    render(<DarkChessOnlineGame onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '進入測試棋局' }))
    const cells = await screen.findAllByRole('gridcell')
    expect(cells).toHaveLength(32)
    expect(cells.every((cell) => cell.getAttribute('aria-label')?.includes('暗棋'))).toBe(true)
    fireEvent.click(cells[0]!)
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ kind: 'flip', cell: 0 }, 0))
    expect(JSON.stringify(submit.mock.calls)).not.toContain('seed')
  })

  it('後手在第一步不能操作棋盤', async () => {
    mocks.session = { ...(mocks.session as object), role: 'guest' }
    render(<DarkChessOnlineGame onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '進入測試棋局' }))
    const cells = await screen.findAllByRole('gridcell')
    expect(cells.every((cell) => (cell as HTMLButtonElement).disabled)).toBe(true)
    fireEvent.click(cells[0]!)
    expect(submit).not.toHaveBeenCalled()
  })

  it('StrictMode 重掛載不會提前關閉房間，真正離開才關閉', async () => {
    const ownClose = vi.fn()
    mocks.session = { ...(mocks.session as object), close: ownClose }
    const screen = render(<StrictMode><DarkChessOnlineGame onBack={vi.fn()} /></StrictMode>)
    fireEvent.click(await screen.findByRole('button', { name: '進入測試棋局' }))
    await screen.findAllByRole('gridcell')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(ownClose).not.toHaveBeenCalled()
    screen.unmount()
    await waitFor(() => expect(ownClose).toHaveBeenCalledTimes(1))
  })
})
