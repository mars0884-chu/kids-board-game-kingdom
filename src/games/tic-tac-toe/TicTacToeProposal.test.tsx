import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicTacToeStorage } from './storage'
import { TicTacToeProposal } from './TicTacToeProposal'

const emptyStorage: TicTacToeStorage = {
  clear: async () => undefined,
  load: async () => null,
  save: async () => undefined,
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ART-005-r03 井字棋正式可玩流程', () => {
  it('共用正式工具、四階難度與逐字注音呈現棋盤', () => {
    const { container } = render(
      <TicTacToeProposal mode="npc" onBack={vi.fn()} storage={emptyStorage} />,
    )

    expect(screen.getByRole('heading', { name: '井字棋' })).toBeInTheDocument()
    expect(screen.getByLabelText('三個連成一線')).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: '井字棋' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提示' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再玩一次' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '成人版' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-bopomofo-pair]').length).toBeGreaterThan(30)
  })

  it('自由練習在兒童落子後由所選難度 NPC 自動走合法一步', async () => {
    vi.useFakeTimers()
    render(<TicTacToeProposal mode="npc" onBack={vi.fn()} storage={emptyStorage} />)
    const board = screen.getByRole('grid', { name: '井字棋' })

    fireEvent.click(within(board).getAllByRole('gridcell', { name: '空格' })[0]!)
    expect(within(board).getAllByRole('gridcell', { name: '空格' })).toHaveLength(8)
    expect(screen.getByRole('status', { name: '月亮正在想一想' })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(within(board).getAllByRole('gridcell', { name: '空格' })).toHaveLength(7)
    expect(screen.getByRole('status', { name: '星星的回合' })).toBeInTheDocument()
  })

  it('互動教學依星光格完成跟著做、防守與三連線', () => {
    render(<TicTacToeProposal mode="tutorial" onBack={vi.fn()} storage={emptyStorage} />)
    const board = screen.getByRole('grid', { name: '井字棋' })
    const cells = within(board).getAllByRole('gridcell')

    expect(within(board).getAllByRole('gridcell', { name: '空格' })).toHaveLength(7)
    fireEvent.click(cells[1]!)
    expect(screen.getByLabelText('試試看有星光的格子')).toBeInTheDocument()

    fireEvent.click(cells[8]!)
    expect(screen.getByLabelText('擋住月亮快連線的位置')).toBeInTheDocument()
    fireEvent.click(cells[2]!)
    expect(screen.getByLabelText('找出能連成三個的位置')).toBeInTheDocument()
    fireEvent.click(cells[6]!)

    expect(screen.getByRole('status', { name: '星星連成三個了' })).toBeInTheDocument()
    expect(screen.getByLabelText('你學會井字棋了')).toBeInTheDocument()
  })

  it('同機雙人由星星與月亮輪流操作，不呼叫 NPC', () => {
    render(<TicTacToeProposal mode="local" onBack={vi.fn()} storage={emptyStorage} />)
    const adult = screen.getByRole('button', { name: '成人版' })
    expect(adult).toBeEnabled()
    fireEvent.click(adult)
    expect(adult).toHaveAttribute('aria-pressed', 'true')
    const board = screen.getByRole('grid', { name: '井字棋' })
    const cells = within(board).getAllByRole('gridcell')

    fireEvent.click(cells[0]!)
    expect(screen.getByRole('status', { name: '月亮玩家請下棋' })).toBeInTheDocument()
    fireEvent.click(cells[1]!)
    expect(screen.getByRole('status', { name: '星星玩家請下棋' })).toBeInTheDocument()
    expect(within(board).getAllByRole('gridcell', { name: '空格' })).toHaveLength(7)
  })

  it('提示依序重述、指出區域並標出候選格，但不代替落子', () => {
    const { container } = render(
      <TicTacToeProposal mode="npc" onBack={vi.fn()} storage={emptyStorage} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '提示' }))
    expect(screen.getByLabelText('讓三個棋子連成一線')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '提示' }))
    expect(screen.getByLabelText('看看中央和角落')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '提示' }))

    expect(screen.getByLabelText('星光標出了候選格')).toBeInTheDocument()
    expect(container.querySelectorAll('.tictactoe-candidate-art')).toHaveLength(1)
    expect(screen.getAllByRole('gridcell', { name: '空格' })).toHaveLength(9)
  })

  it('載入通過規則驗證的既有局面並繼續顯示', async () => {
    const storage: TicTacToeStorage = {
      clear: async () => undefined,
      load: async () => ({
        difficulty: 'growth',
        hintLevel: 0,
        state: (await import('./rules')).replayTicTacToeMoves([0, 4]),
        tutorialStep: 0,
      }),
      save: async () => undefined,
    }

    render(<TicTacToeProposal mode="local" onBack={vi.fn()} storage={storage} />)

    await waitFor(() => {
      expect(screen.getByLabelText('回到剛才的棋局')).toBeInTheDocument()
    })
    expect(screen.getAllByRole('gridcell', { name: '空格' })).toHaveLength(7)
  })
})
