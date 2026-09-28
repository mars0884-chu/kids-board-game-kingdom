import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GoNineLayoutProposal } from './GoNineLayoutProposal'

describe('圍棋 13 路畫面提案', () => {
  it('顯示正確的 13 路棋盤、星位、雙方示範棋子與共用返回鍵', () => {
    const onBack = vi.fn()
    const { container } = render(<GoNineLayoutProposal onBack={onBack} />)
    const board = screen.getByRole('img', { name: '13路圍棋棋盤示範' })

    expect(screen.getByRole('heading', { name: '圍棋' })).toBeInTheDocument()
    expect(container.querySelector('[data-proposal="ART-012-r05"]')).toBeInTheDocument()
    expect(board).toHaveAttribute('data-board-size', '13')
    expect(board).toHaveAttribute('data-line-count', '26')
    expect(board).toHaveAttribute('data-grid-start', '49.5')
    expect(board).toHaveAttribute('data-grid-end', '550.5')
    expect(container.querySelectorAll('.go-nine-proposal__grid line')).toHaveLength(26)
    expect(container.querySelectorAll('.go-nine-proposal__stars circle')).toHaveLength(9)
    const frameLayers = [...container.querySelectorAll('.go-nine-proposal__board rect[data-frame-layer]')]
    expect(frameLayers.map((layer) => layer.getAttribute('data-frame-layer'))).toEqual(['outer', 'trim', 'surface'])
    expect(frameLayers.every((layer) => !layer.hasAttribute('rx') && !layer.hasAttribute('ry'))).toBe(true)
    const insideFrameEdge = Number(frameLayers[2].getAttribute('x')) + Number(frameLayers[2].getAttribute('stroke-width')) / 2
    const edgeStoneClearance = Number(board.getAttribute('data-grid-start')) - insideFrameEdge - 18.2
    expect(edgeStoneClearance).toBeCloseTo(4.3)
    expect(container.querySelectorAll('.go-nine-proposal__stone')).toHaveLength(14)
    expect(container.querySelectorAll('.go-nine-proposal__stone--black')).toHaveLength(7)
    expect(container.querySelectorAll('.go-nine-proposal__stone--white')).toHaveLength(7)
    const stones = [...container.querySelectorAll<SVGCircleElement>('.go-nine-proposal__stone')]
    for (let left = 0; left < stones.length; left += 1) {
      for (let right = left + 1; right < stones.length; right += 1) {
        const distance = Math.hypot(Number(stones[left].getAttribute('cx')) - Number(stones[right].getAttribute('cx')), Number(stones[left].getAttribute('cy')) - Number(stones[right].getAttribute('cy')))
        const drawnRadii = [stones[left], stones[right]].map((stone) => Number(stone.getAttribute('r')) + Number(stone.getAttribute('stroke-width') ?? 1.2) / 2)
        expect(distance).toBeGreaterThanOrEqual(drawnRadii[0] + drawnRadii[1])
      }
    }
    expect(container.querySelectorAll('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '返回' })).toHaveClass('child-tool')
    expect(container.querySelector('[data-board-size="19"]')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('9 路畫面預覽呈現九條線位與雙方示範棋子', () => {
    const { container } = render(<GoNineLayoutProposal onBack={vi.fn()} boardSize={9} />)
    const board = screen.getByRole('img', { name: '9路圍棋棋盤示範' })

    expect(container.querySelector('[data-proposal="ART-012-r02"]')).toBeInTheDocument()
    expect(board).toHaveAttribute('data-board-size', '9')
    expect(board).toHaveAttribute('data-line-count', '18')
    expect(container.querySelectorAll('.go-nine-proposal__grid line')).toHaveLength(18)
    expect(container.querySelectorAll('.go-nine-proposal__stars circle')).toHaveLength(9)
    expect(container.querySelectorAll('.go-nine-proposal__stone--black')).toHaveLength(7)
    expect(container.querySelectorAll('.go-nine-proposal__stone--white')).toHaveLength(7)
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('19 路 r07 放大棋面並向外擴展格線，滿版連續棋子仍不互相覆蓋', () => {
    const { container } = render(<GoNineLayoutProposal onBack={vi.fn()} boardSize={19} />)
    const board = screen.getByRole('img', { name: '19路圍棋棋盤示範' })

    expect(container.querySelector('[data-proposal="ART-012-r07"]')).toBeInTheDocument()
    expect(board).toHaveAttribute('data-board-size', '19')
    expect(board).toHaveAttribute('data-line-count', '38')
    expect(board).toHaveAttribute('data-grid-start', '27')
    expect(board).toHaveAttribute('data-grid-end', '573')
    expect(board).toHaveAttribute('data-stone-radius', '12.2')
    expect(container.querySelectorAll('.go-nine-proposal__grid line')).toHaveLength(38)
    expect(container.querySelectorAll('.go-nine-proposal__stars circle')).toHaveLength(9)

    const frameLayers = [...container.querySelectorAll<SVGRectElement>('.go-nine-proposal__board rect[data-frame-layer]')]
    expect(frameLayers.map((layer) => Number(layer.getAttribute('x')))).toEqual([0, 5, 10])
    expect(frameLayers.map((layer) => Number(layer.getAttribute('width')))).toEqual([600, 590, 580])
    expect(frameLayers.every((layer) => !layer.hasAttribute('rx') && !layer.hasAttribute('ry'))).toBe(true)
    const insideFrameEdge = Number(frameLayers[2].getAttribute('x')) + Number(frameLayers[2].getAttribute('stroke-width')) / 2
    const edgeStoneClearance = Number(board.getAttribute('data-grid-start')) - insideFrameEdge - 12.2 - 0.6
    expect(edgeStoneClearance).toBeCloseTo(3.2)
    expect((Number(board.getAttribute('data-grid-end')) - Number(board.getAttribute('data-grid-start'))) / 18).toBeCloseTo(30.3333, 3)

    const stones = [...container.querySelectorAll<SVGCircleElement>('.go-nine-proposal__stone')]
    expect(stones).toHaveLength(38)
    expect(container.querySelectorAll('.go-nine-proposal__stone--black')).toHaveLength(19)
    expect(container.querySelectorAll('.go-nine-proposal__stone--white')).toHaveLength(19)
    for (let left = 0; left < stones.length; left += 1) {
      for (let right = left + 1; right < stones.length; right += 1) {
        const distance = Math.hypot(Number(stones[left].getAttribute('cx')) - Number(stones[right].getAttribute('cx')), Number(stones[left].getAttribute('cy')) - Number(stones[right].getAttribute('cy')))
        const drawnRadii = [stones[left], stones[right]].map((stone) => Number(stone.getAttribute('r')) + Number(stone.getAttribute('stroke-width') ?? 1.2) / 2)
        expect(distance).toBeGreaterThanOrEqual(drawnRadii[0] + drawnRadii[1])
      }
    }
    expect((573 - 27) / 18 - 2 * (12.2 + 0.6)).toBeCloseTo(4.7333, 3)
    for (const y of [8, 9]) {
      const row = stones.filter((stone) => Number(stone.getAttribute('data-y')) === y).sort((a, b) => Number(a.getAttribute('data-x')) - Number(b.getAttribute('data-x')))
      expect(row).toHaveLength(19)
      expect(row.every((stone, index) => Number(stone.getAttribute('data-x')) === index)).toBe(true)
    }
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })
})
