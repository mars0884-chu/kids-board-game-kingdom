import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JumpChessGame } from './JumpChessGame'
import { JUMP_CHESS_LAYOUT_SPAN_HEIGHT, JUMP_CHESS_LAYOUT_SPAN_WIDTH, createJumpChessState, getJumpCampCells, getJumpHole, getLegalJumpMoves } from './rules'

describe('跳棋第一個可試玩畫面', () => {
  it('顯示 121 個棋孔，並將第一位玩家放在下方先手', () => {
    const { container } = render(<JumpChessGame mode="local" onBack={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '跳棋' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: '跳棋' })).toBeInTheDocument()
    expect(container.querySelectorAll('.jump-chess-hole')).toHaveLength(121)
    expect(container.querySelectorAll('.jump-chess-hole--player-one')).toHaveLength(10)
    expect(container.querySelectorAll('.jump-chess-hole--player-two')).toHaveLength(10)
    expect(container.querySelector('.jump-chess-board__star-outline')).toBeInTheDocument()
    expect(container.querySelectorAll('.jump-chess-piece--player-one')).toHaveLength(10)
    expect(container.querySelectorAll('.jump-chess-piece--player-two')).toHaveLength(10)
    expect(container.querySelectorAll('.jump-chess-board__camp')).toHaveLength(6)
    expect(container.querySelectorAll('.jump-chess-board__star-outline')).toHaveLength(1)
    expect(container.querySelector('.jump-chess-board__center-outline')).not.toBeInTheDocument()
    const playerOneCamp = getJumpCampCells('player1')
    const playerTwoCamp = getJumpCampCells('player2')
    expect(playerOneCamp.every((cell) => getJumpHole(cell)!.layoutY > getJumpHole(playerTwoCamp[0]!)!.layoutY)).toBe(true)
    expect(playerOneCamp).toContain(Number(container.querySelector('.jump-chess-hole--player-one')!.getAttribute('data-cell')))
    expect(playerTwoCamp).toContain(Number(container.querySelector('.jump-chess-hole--player-two')!.getAttribute('data-cell')))
  })

  it('選取棋子後顯示合法目的格，完成一般移動後換手', () => {
    const { container } = render(<JumpChessGame mode="local" onBack={vi.fn()} />)
    const firstStep = getLegalJumpMoves(createJumpChessState()).find((move) => move.kind === 'step')!
    const piece = container.querySelector(`[data-cell="${firstStep.from}"]`) as HTMLElement

    fireEvent.click(piece)
    expect(container.querySelectorAll('.jump-chess-hole--selected')).toHaveLength(1)
    expect(container.querySelector(`[data-cell="${firstStep.to}"]`)).toHaveClass('jump-chess-hole--target')
    fireEvent.click(container.querySelector(`[data-cell="${firstStep.to}"]`) as HTMLElement)

    expect(container.querySelector('.jump-chess-game__turn-count strong')).toHaveTextContent('1')
    expect(container.querySelector('.jump-chess-player--two')).toHaveClass('is-active')
    expect(container.querySelectorAll('.jump-chess-hole--selected')).toHaveLength(0)
  })

  it('窄版棋孔觸控重疊時，依指標座標選取最近的實際棋孔', () => {
    const { container } = render(<JumpChessGame mode="local" onBack={vi.fn()} />)
    const firstStep = getLegalJumpMoves(createJumpChessState()).find((move) => move.kind === 'step')!
    const sourceHole = getJumpHole(firstStep.from)!
    const board = container.querySelector('.jump-chess-board') as HTMLDivElement
    const bounds = { left: 100, top: 50, width: 300, height: 360, right: 400, bottom: 410, x: 100, y: 50, toJSON: () => ({}) }

    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(bounds as DOMRect)
    fireEvent.pointerDown(board, {
      button: 0,
      clientX: bounds.left + (sourceHole.layoutX / JUMP_CHESS_LAYOUT_SPAN_WIDTH) * bounds.width,
      clientY: bounds.top + (sourceHole.layoutY / JUMP_CHESS_LAYOUT_SPAN_HEIGHT) * bounds.height,
    })

    expect(container.querySelector('.jump-chess-hole--selected')).toHaveAttribute('data-cell', String(firstStep.from))
  })

  it('跳躍後保留選中棋子，按結束回合才切換玩家', () => {
    const { container } = render(<JumpChessGame mode="local" onBack={vi.fn()} />)
    const jump = getLegalJumpMoves(createJumpChessState()).find((move) => move.kind === 'jump')
    expect(jump).toBeDefined()

    fireEvent.click(container.querySelector(`[data-cell="${jump!.from}"]`) as HTMLElement)
    fireEvent.click(container.querySelector(`[data-cell="${jump!.to}"]`) as HTMLElement)

    expect(container.querySelector('.jump-chess-hole--selected')).toHaveAttribute('data-cell', String(jump!.to))
    expect(container.querySelectorAll('.jump-chess-actions button')).toHaveLength(2)
    expect(container.querySelector('.jump-chess-game__turn-count strong')).toHaveTextContent('0')

    fireEvent.click(container.querySelector('.jump-chess-finish-action') as HTMLElement)
    expect(container.querySelector('.jump-chess-game__turn-count strong')).toHaveTextContent('1')
    expect(container.querySelector('.jump-chess-player--two')).toHaveClass('is-active')
  })

  it('依共用配置顯示返回／聽一聽／暫停，不顯示額外的暫停語音按鍵', () => {
    const { container } = render(<JumpChessGame mode="local" onBack={vi.fn()} />)
    const tools = container.querySelector('.jump-chess-tools')!

    expect(container.querySelector('.jump-chess-game__back')).not.toBeInTheDocument()
    expect(tools.querySelectorAll('.child-tool')).toHaveLength(3)
    expect(tools.querySelectorAll('.child-tool')[0]).toHaveTextContent('返')
    expect(tools.querySelectorAll('.child-tool')[0]).toHaveTextContent('回')
    expect(tools).not.toHaveTextContent('暫停語音')
    expect(tools).not.toHaveTextContent('繼續語音')
    const pauseButton = tools.querySelectorAll('.child-tool')[2] as HTMLButtonElement
    expect(pauseButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(pauseButton)
    expect(pauseButton).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(pauseButton)
    expect(pauseButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('教學模式明確標示目前關卡與應先點的棋子，且不顯示連跳數字', () => {
    const { container } = render(<JumpChessGame mode="adventure" onBack={vi.fn()} />)

    expect(container.querySelectorAll('.jump-chess-hole--tutorial-source')).toHaveLength(1)
    expect(container.querySelector('.jump-chess-tutorial-card__title')).toHaveTextContent('第')
    expect(container.querySelector('.jump-chess-tutorial-card__title')).toHaveTextContent('相')
    expect(container.querySelectorAll('.jump-chess-hole__path-number')).toHaveLength(0)
  })
})
