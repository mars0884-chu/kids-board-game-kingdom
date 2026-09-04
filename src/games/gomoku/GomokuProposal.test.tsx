import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GomokuProposal } from './GomokuProposal'
import { replayGomokuMoves } from './rules'
import type { GomokuStorage } from './storage'
import { getChildText } from '../../content/child-text'

const emptyStorage: GomokuStorage = {
  clear: async () => undefined,
  load: async () => null,
  save: async () => undefined,
}

afterEach(() => vi.useRealTimers())

describe('五子棋畫面', () => {
  it('自由練習提供十五乘十五棋盤與四階 NPC 難度', () => {
    const { container } = render(<GomokuProposal mode="npc" onBack={vi.fn()} storage={emptyStorage} />)
    const board = screen.getByRole('grid', { name: '五子棋' })
    expect(within(board).getAllByRole('gridcell')).toHaveLength(225)
    expect(screen.getAllByRole('button', { name: /入門|成長|挑戰|成人版/ })).toHaveLength(4)
    expect(container.querySelectorAll('[data-bopomofo-pair]').length).toBeGreaterThan(12)
  })

  it('冒險第一關的兩端皆可完成，其他位置不會落子', () => {
    const { container } = render(<GomokuProposal mode="adventure" onBack={vi.fn()} storage={emptyStorage} />)
    const board = within(screen.getByRole('grid', { name: '五子棋' }))
    const cells = board.getAllByRole('gridcell')

    fireEvent.click(cells[110]!)
    expect(screen.getByLabelText('星光格是這關的目標，再找找看')).toBeInTheDocument()
    expect(cells[110]).toBeEnabled()

    fireEvent.click(cells[111]!)
    expect(screen.getByLabelText('你得到一枚智慧星章')).toBeInTheDocument()
    expect(container.querySelectorAll('.gomoku-adventure-level--complete')).toHaveLength(1)
    expect(cells[111]).toBeDisabled()
    expect(screen.queryByRole('button', { name: '入門' })).not.toBeInTheDocument()
  })

  it('禁手關保留格線標記，且任一合法位置都能完成', () => {
    const { container } = render(<GomokuProposal mode="adventure" onBack={vi.fn()} storage={emptyStorage} />)
    fireEvent.click(screen.getByRole('button', { name: /第四關避開禁手/ }))
    const cells = within(screen.getByRole('grid')).getAllByRole('gridcell')

    expect(container.querySelector('.gomoku-cell--forbidden .gomoku-forbidden-marker')).toBeInTheDocument()
    fireEvent.click(cells[112]!)
    expect(screen.getByLabelText('這裡會同時做出兩條三子線，換一個空位試試看。')).toBeInTheDocument()
    expect(cells[112]).toBeEnabled()

    fireEvent.click(cells[224]!)
    expect(screen.getByLabelText('你得到一枚智慧星章')).toBeInTheDocument()
    expect(cells[224]).toBeDisabled()
  })

  it('可選擇並重玩各個固定關卡', () => {
    render(<GomokuProposal mode="adventure" onBack={vi.fn()} storage={emptyStorage} />)
    fireEvent.click(screen.getByRole('button', { name: /第二關守住連線/ }))
    expect(screen.getByRole('status', { name: '第二關守住連線' })).toBeInTheDocument()
    const cells = within(screen.getByRole('grid')).getAllByRole('gridcell')
    fireEvent.click(cells[116]!)
    expect(screen.getByLabelText('你得到一枚智慧星章')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '第二關守住連線' }))
    expect(screen.getByLabelText('白棋快連成五子，找出最後一格')).toBeInTheDocument()
    expect(cells[116]).toBeEnabled()
  })

  it('恢復自由練習局面後，NPC 會接續回應', async () => {
    vi.useFakeTimers()
    const storage: GomokuStorage = {
      clear: async () => undefined,
      load: async () => ({ difficulty: 'growth', hintLevel: 0, state: replayGomokuMoves([112, 97]), tutorialStep: 0 }),
      save: async () => undefined,
    }
    render(<GomokuProposal mode="npc" onBack={vi.fn()} storage={storage} />)
    await act(async () => { await Promise.resolve() })
    const board = within(screen.getByRole('grid'))
    const emptyCellName = getChildText('gomoku.empty_cell').text_zh_tw
    expect(board.getAllByRole('gridcell', { name: emptyCellName })).toHaveLength(223)
    fireEvent.click(board.getAllByRole('gridcell', { name: emptyCellName })[0]!)
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(board.getAllByRole('gridcell', { name: emptyCellName })).toHaveLength(221)
  })

  it('同機雙人可選成人版，並讓黑白雙方輪流落子', () => {
    render(<GomokuProposal mode="local" onBack={vi.fn()} storage={emptyStorage} />)
    const adult = screen.getByRole('button', { name: '成人版' })
    expect(adult).toBeEnabled()
    fireEvent.click(adult)
    expect(adult).toHaveAttribute('aria-pressed', 'true')
    const cells = within(screen.getByRole('grid')).getAllByRole('gridcell')
    fireEvent.click(cells[112]!)
    expect(screen.getByRole('status', { name: '白方請落子' })).toBeInTheDocument()
    fireEvent.click(cells[97]!)
    expect(screen.getByRole('status', { name: '黑方請落子' })).toBeInTheDocument()
  })

  it('棋盤保留單一鍵盤焦點，並可用方向鍵移到下一個空交點', () => {
    render(<GomokuProposal mode="local" onBack={vi.fn()} storage={emptyStorage} />)
    const cells = within(screen.getByRole('grid')).getAllByRole('gridcell')

    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1)
    expect(cells[112]).toHaveAttribute('aria-rowindex', '8')
    expect(cells[112]).toHaveAttribute('aria-colindex', '8')

    cells[112]!.focus()
    fireEvent.keyDown(cells[112]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cells[113])
  })
})
