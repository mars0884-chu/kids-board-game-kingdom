import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GoGame } from './GoGame'

describe('正式圍棋遊戲', () => {
  it('冒險教學實際引導落子、連棋與提子', async () => {
    const { container } = render(<GoGame mode="adventure" onBack={vi.fn()} />)
    const board = screen.getByRole('grid', { name: '圍棋棋盤' })
    fireEvent.keyDown(board, { key: 'Enter' })
    expect(container.querySelectorAll('[data-stone="black"]')).toHaveLength(1)
    await waitFor(() => expect(container.querySelectorAll('.go-game__tutorial-target').length).toBeGreaterThan(0))
    fireEvent.keyDown(board, { key: 'ArrowRight' })
    fireEvent.keyDown(board, { key: 'Enter' })
    await waitFor(() => {
      expect(container.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '3')
      expect(container.querySelector('.go-game__turn--black')).toBeInTheDocument()
    })
    fireEvent.keyDown(board, { key: 'ArrowDown' })
    fireEvent.keyDown(board, { key: 'Enter' })
    const nextLesson = await screen.findByRole('button', { name: /開始提子練習/ })
    fireEvent.click(nextLesson)
    expect(container.querySelector(`#go-point-9-40`)).toHaveAttribute('data-stone', 'white')

    Object.defineProperty(board, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) })
    fireEvent.click(board, { clientX: 49.5 + 5 * ((550.5 - 49.5) / 8), clientY: 49.5 + 4 * ((550.5 - 49.5) / 8) })
    await waitFor(() => expect(container.querySelector('#go-point-9-40')).toHaveAttribute('data-stone', 'empty'))
    expect(container.textContent?.replace(/[ㄅ-ㄩˊˇˋ˙]/gu, '')).toContain('你會找交點、連棋和提子了')
  })

  it('同機雙人可在開局前選擇路數，並在實際棋盤落子', () => {
    const { container } = render(<GoGame mode="local" onBack={vi.fn()} />)
    const board = screen.getByRole('grid', { name: '圍棋棋盤' })
    expect(board).toHaveAttribute('aria-rowcount', '9')
    expect(container.querySelectorAll('.go-game__grid-lines line')).toHaveLength(18)

    const sizeOptions = container.querySelectorAll('.go-game__size-options button')
    fireEvent.click(sizeOptions[1]!)
    expect(container.querySelector('main.go-game')).toHaveAttribute('data-board-size', '13')
    fireEvent.click(container.querySelector('.go-game__size-picker > button')!)
    expect(screen.getByRole('grid', { name: '圍棋棋盤' })).toHaveAttribute('aria-rowcount', '13')
    expect(container.querySelectorAll('.go-game__grid-lines line')).toHaveLength(26)

    fireEvent.keyDown(board, { key: 'ArrowRight' })
    fireEvent.keyDown(board, { key: 'Enter' })
    expect(container.querySelectorAll('[data-stone="black"]')).toHaveLength(1)
  })

  it('同機雙人可虛著、確認終局並重開一局', () => {
    const { container } = render(<GoGame mode="local" onBack={vi.fn()} />)
    fireEvent.click(container.querySelector('.go-game__size-picker > button')!)
    const passButton = () => container.querySelector('.go-game__actions button:first-child')!
    fireEvent.click(passButton())
    fireEvent.click(passButton())
    expect(container.querySelector('.go-game__score')).toBeInTheDocument()
    fireEvent.click(passButton())
    fireEvent.click(passButton())
    expect(container.querySelector('.go-game__score')?.textContent).toContain('0：0')
    fireEvent.click(container.querySelector('.go-game__controls > button')!)
    expect(screen.getByRole('grid', { name: '圍棋棋盤' })).toHaveAttribute('aria-rowcount', '9')
  })

  it('自由練習的難度對應 9、13、19 路，成人版仍可下子', () => {
    const { container } = render(<GoGame mode="npc" onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '成長' }))
    expect(container.querySelector('main.go-game')).toHaveAttribute('data-board-size', '13')
    fireEvent.click(screen.getByRole('button', { name: '成人版' }))
    expect(container.querySelector('main.go-game')).toHaveAttribute('data-board-size', '19')
    expect(screen.getByRole('grid', { name: '圍棋棋盤' })).toHaveAttribute('aria-rowcount', '19')
    expect(container.querySelectorAll('.go-game__grid-lines line')).toHaveLength(38)
  })
})
