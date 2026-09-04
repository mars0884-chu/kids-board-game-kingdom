import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DarkChessGame } from './DarkChessGame'

describe('暗棋兒童流程骨架', () => {
  it('冒險闖關可依序完成六個互動教學關卡', () => {
    const { container } = render(<DarkChessGame mode="adventure" onBack={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '暗棋' })).toBeInTheDocument()
    expect(screen.getByLabelText('六個教學關卡')).toBeInTheDocument()
    expect(container.querySelectorAll('.dark-chess-piece--hidden')).toHaveLength(32)

    fireEvent.click(screen.getByRole('gridcell', { name: /第 1 格/ }))
    expect(screen.getByLabelText('你完成了一個教學關卡')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一關' }))

    fireEvent.click(screen.getByRole('gridcell', { name: /第 2 格/ }))
    fireEvent.click(screen.getByRole('button', { name: '下一關' }))

    fireEvent.click(screen.getByRole('gridcell', { name: /第 1 格，紅俥/ }))
    fireEvent.click(screen.getAllByRole('gridcell')[1]!)
    fireEvent.click(screen.getByRole('button', { name: '下一關' }))

    fireEvent.click(screen.getByRole('gridcell', { name: /第 1 格，紅俥/ }))
    fireEvent.click(screen.getByRole('gridcell', { name: /第 2 格，黑馬/ }))
    fireEvent.click(screen.getByRole('button', { name: '下一關' }))

    fireEvent.click(screen.getByRole('gridcell', { name: /第 1 格，紅炮/ }))
    fireEvent.click(screen.getByRole('gridcell', { name: /第 4 格，黑馬/ }))
    fireEvent.click(screen.getByRole('button', { name: '下一關' }))

    fireEvent.click(screen.getByRole('gridcell', { name: /第 1 格，紅兵/ }))
    fireEvent.click(screen.getAllByRole('gridcell')[1]!)

    expect(screen.getAllByLabelText('你完成了一個教學關卡')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '下一關' }))
    expect(screen.getAllByRole('button', { name: '再玩一次' })).toHaveLength(1)
    expect(container.querySelector('.dark-chess-game__actions--single')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '再玩一次' }))
    expect(screen.getByLabelText('第一關翻棋')).toBeInTheDocument()
  })

  it('美術提案入口顯示可辨識的實體棋子，而不是以暗棋文字代替背面', () => {
    const { container } = render(<DarkChessGame mode="adventure" artProposal onBack={vi.fn()} />)

    expect(container.querySelectorAll('.dark-chess-piece')).toHaveLength(32)
    expect(container.querySelectorAll('.dark-chess-piece--red, .dark-chess-piece--black').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.dark-chess-piece--hidden').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('盤上棋子32／32')).toBeInTheDocument()
    expect(container.querySelector('.dark-chess-piece__back-gem')).toHaveAttribute('data-back-art', 'gem-seal')
    expect(container.querySelector('.dark-chess-piece__back-gem-core')).toBeInTheDocument()
  })

  it('自由練習顯示四階 NPC 難度，雙人同樂不顯示 NPC 難度', () => {
    const { unmount } = render(<DarkChessGame mode="npc" onBack={vi.fn()} />)
    expect(screen.getByRole('group', { name: '選擇難度' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '挑戰' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '成人版' })).toBeInTheDocument()
    unmount()

    render(<DarkChessGame mode="local" onBack={vi.fn()} />)
    expect(screen.queryByRole('group', { name: '選擇難度' })).not.toBeInTheDocument()
  })
})
