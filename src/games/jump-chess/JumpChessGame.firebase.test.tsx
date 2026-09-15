import { useEffect } from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JumpChessGame } from './JumpChessGame'
import { createJumpChessState, getLegalJumpMoves, applyJumpChessMove, type JumpChessState } from './rules'

const mocks = vi.hoisted(() => ({
  state: null as ((state: JumpChessState) => void) | null,
  connection: null as ((connected: boolean) => void) | null,
  submit: vi.fn(),
  close: vi.fn(),
}))

vi.mock('../../online/WebRtcPairing', () => ({
  WebRtcPairing: ({ onConnected }: { onConnected: (session: unknown) => void }) => {
    useEffect(() => {
      onConnected({
        transport: 'firebase', sessionId: 'firebase-ui', role: 'host',
        pairingControls: { report: vi.fn(), block: vi.fn() },
        submit: mocks.submit, close: mocks.close,
        subscribe: (state: (state: JumpChessState) => void, connection: (value: boolean) => void) => {
          mocks.state = state; mocks.connection = connection
          state(createJumpChessState()); connection(true)
          return () => {}
        },
      })
    }, [onConnected])
    return null
  },
}))

describe('跳棋 Firebase 畫面整合', () => {
  it('等待伺服器確認才更新棋盤，提交中鎖定操作', async () => {
    let finish!: () => void
    mocks.submit.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const { container, unmount } = render(<JumpChessGame mode="online" onBack={vi.fn()} />)
    await waitFor(() => expect(container.querySelector('.jump-chess-board')).toBeInTheDocument())
    const initial = createJumpChessState()
    const move = getLegalJumpMoves(initial).find((candidate) => candidate.kind === 'step')!
    fireEvent.click(container.querySelector('[data-cell="'+move.from+'"]')!)
    fireEvent.click(container.querySelector('[data-cell="'+move.to+'"]')!)
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce())
    expect(container.querySelector('.jump-chess-game__turn-count strong')).toHaveTextContent('0')
    expect([...container.querySelectorAll<HTMLButtonElement>('.jump-chess-hole')].every((hole) => hole.disabled)).toBe(true)
    await act(async () => { mocks.state?.(applyJumpChessMove(initial, move)); finish() })
    expect(container.querySelector('.jump-chess-game__turn-count strong')).toHaveTextContent('1')
    unmount()
    expect(mocks.close).toHaveBeenCalled()
  })
  it('離線鎖定棋盤且不判負，恢復時重新開放當前玩家', async () => {
    const { container } = render(<JumpChessGame mode="online" onBack={vi.fn()} />)
    await waitFor(() => expect(container.querySelector('.jump-chess-board')).toBeInTheDocument())
    act(() => mocks.connection?.(false))
    expect([...container.querySelectorAll<HTMLButtonElement>('.jump-chess-hole')].every((hole) => hole.disabled)).toBe(true)
    expect(container.querySelectorAll('.jump-chess-piece')).toHaveLength(20)
    act(() => mocks.connection?.(true))
    expect([...container.querySelectorAll<HTMLButtonElement>('.jump-chess-hole')].some((hole) => !hole.disabled)).toBe(true)
  })
})
