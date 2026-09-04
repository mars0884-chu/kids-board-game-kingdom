import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AnimalChessGame } from './AnimalChessGame'
import type { AnimalChessStorage } from './storage'

const emptyStorage: AnimalChessStorage = {
  load: async () => null,
  save: async () => undefined,
  clear: async () => undefined,
}

describe('動物棋第一個可玩畫面', () => {
  it('顯示完整 7×9 棋盤、固定教學局面與六關教學', () => {
    const { container } = render(<AnimalChessGame mode="adventure" onBack={vi.fn()} storage={emptyStorage} />)

    expect(screen.getByRole('heading', { name: '動物棋' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: '動物棋' })).toBeInTheDocument()
    expect(screen.getByLabelText('六關教學')).toBeInTheDocument()
    expect(container.querySelectorAll('.animal-chess-cell')).toHaveLength(63)
    expect(container.querySelectorAll('.animal-icon')).toHaveLength(2)
    expect(container.querySelectorAll('.animal-piece--player1')).toHaveLength(1)
    expect(container.querySelectorAll('.animal-piece--player2')).toHaveLength(1)
    expect(container.querySelectorAll('.animal-piece__owner-mark')).toHaveLength(2)
    expect(screen.getByRole('gridcell', { name: '第一位玩家獅' })).toBeInTheDocument()
  })

  it('標準初始局面由下方第一位玩家先手，上方第二位玩家後手', () => {
    const { container } = render(<AnimalChessGame mode="local" onBack={vi.fn()} storage={emptyStorage} />)

    expect(container.querySelector('[data-cell="56"]')).toHaveClass('animal-chess-cell')
    expect(container.querySelector('[data-cell="56"] .animal-piece--player1')).toBeInTheDocument()
    expect(container.querySelector('[data-cell="0"] .animal-piece--player2')).toBeInTheDocument()
    expect(container.querySelector('[data-cell="59"]')).toHaveClass('animal-chess-cell--den')
    expect(container.querySelector('[data-cell="3"]')).toHaveClass('animal-chess-cell--den')
    expect(screen.getByRole('gridcell', { name: '第一位玩家獅' })).toHaveAttribute('data-cell', '62')
    expect(screen.getByRole('gridcell', { name: '第二位玩家獅' })).toHaveAttribute('data-cell', '0')
  })

  it('選取動物後顯示合法目的格，點擊後換到第二位玩家', () => {
    const { container } = render(<AnimalChessGame mode="local" onBack={vi.fn()} storage={emptyStorage} />)
    const lion = screen.getByRole('gridcell', { name: '第一位玩家獅' })

    fireEvent.click(lion)
    expect(container.querySelectorAll('.animal-chess-cell--target').length).toBeGreaterThan(0)
    fireEvent.click(container.querySelector('[data-cell="1"]') as HTMLElement)
    expect(screen.getByLabelText('場上棋子')).toBeInTheDocument()
  })

  it('冒險教學第二次點擊目的格就完成，不需要第三次點棋子', () => {
    const { container } = render(<AnimalChessGame mode="adventure" onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('gridcell', { name: '第一位玩家獅' }))
    expect(screen.getByRole('status').querySelector('[aria-label="第二步，請點亮起的格子"]')).not.toBeNull()
    fireEvent.click(container.querySelector('[data-cell="24"]') as HTMLElement)

    expect(screen.getByRole('button', { name: '下一關' })).toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent('棋棋貓正在想')
    expect(screen.getByRole('gridcell', { name: '第一位玩家獅' })).toHaveAttribute('data-cell', '24')
  })

  it('自由練習保留四階 NPC 難度，同機雙人不顯示難度', () => {
    const { unmount } = render(<AnimalChessGame mode="npc" onBack={vi.fn()} />)
    expect(screen.getByRole('group', { name: '選擇難度' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '成人版' })).toBeInTheDocument()
    unmount()

    render(<AnimalChessGame mode="local" onBack={vi.fn()} storage={emptyStorage} />)
    expect(screen.queryByRole('group', { name: '選擇難度' })).not.toBeInTheDocument()
  })

  it('六關教學依序示範移動、吃子、特殊規則、陷阱與獸穴', () => {
    const { container } = render(<AnimalChessGame mode="adventure" onBack={vi.fn()} storage={emptyStorage} />)

    const completeMove = (from: number, to: number) => {
      fireEvent.click(container.querySelector(`[data-cell="${from}"]`) as HTMLElement)
      fireEvent.click(container.querySelector(`[data-cell="${to}"]`) as HTMLElement)
    }
    const next = () => fireEvent.click(screen.getByRole('button', { name: '下一關' }))

    completeMove(31, 24)
    expect(screen.getByRole('button', { name: '下一關' })).toBeInTheDocument()
    next()

    completeMove(31, 24)
    expect(screen.getByRole('gridcell', { name: '第一位玩家獅' })).toHaveAttribute('data-cell', '24')
    expect(screen.queryByRole('gridcell', { name: '第二位玩家狗' })).not.toBeInTheDocument()
    next()
    completeMove(31, 32)
    expect(screen.getByRole('gridcell', { name: '第一位玩家鼠' })).toHaveAttribute('data-cell', '32')
    expect(screen.queryByRole('gridcell', { name: '第二位玩家象' })).not.toBeInTheDocument()
    next()
    completeMove(15, 22)
    expect(screen.getByRole('gridcell', { name: '第一位玩家鼠' })).toHaveAttribute('data-cell', '22')
    next()
    completeMove(18, 46)
    expect(screen.getByRole('gridcell', { name: '第一位玩家獅' })).toHaveAttribute('data-cell', '46')
    expect(screen.getByRole('button', { name: '下一關' })).toBeInTheDocument()
    next()

    expect(screen.getByRole('status').querySelector('[aria-label="第一步，請點貓"]')).not.toBeNull()
    expect(screen.getByRole('gridcell', { name: '第一位玩家貓' })).toHaveAttribute('data-cell', '51')
    expect(screen.getByRole('gridcell', { name: '第二位玩家象' })).toHaveAttribute('data-cell', '52')
    completeMove(51, 52)
    expect(screen.queryByRole('button', { name: '下一關' })).not.toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: '第一位玩家貓' })).toHaveAttribute('data-cell', '52')
    expect(screen.getByRole('gridcell', { name: '第二位玩家狗' })).toHaveAttribute('data-cell', '60')
    completeMove(60, 59)
    expect(screen.getByRole('button', { name: '重新學一次' })).toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent('棋棋貓正在想')
  })
})
