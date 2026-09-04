import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getChildText } from '../../content/child-text'
import { ReversiArtProposal } from './ReversiArtProposal'

describe('黑白棋正式美術提案畫面', () => {
  it('以可操作的標準開局呈現八乘八棋盤、四個合法落點與逐字注音', () => {
    const { container } = render(<ReversiArtProposal mode="npc" onBack={vi.fn()} />)
    const board = screen.getByRole('grid', { name: '黑白棋' })

    expect(within(board).getAllByRole('gridcell')).toHaveLength(64)
    expect(within(board).getAllByRole('gridcell', { name: '可以落子的格子' })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: /入門|成長|挑戰|成人版/ })).toHaveLength(4)
    expect(container.querySelectorAll('[data-bopomofo-pair]').length).toBeGreaterThan(10)
  })

  it('同機雙人模式不顯示 NPC 難度選擇', () => {
    render(<ReversiArtProposal mode="local" onBack={vi.fn()} />)

    expect(screen.queryByRole('group', { name: '選擇難度' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('雙人同樂')).toBeInTheDocument()
  })

  it('自由練習與雙人同樂都保留返回、聽一聽與暫停按鍵', () => {
    const { unmount } = render(<ReversiArtProposal mode="npc" onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '聽一聽' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暫停' })).toBeInTheDocument()
    unmount()

    render(<ReversiArtProposal mode="local" onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '聽一聽' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暫停' })).toBeInTheDocument()
  })

  it('自由練習在白棋回合由 NPC 接手且暫時鎖定棋盤', () => {
    render(<ReversiArtProposal mode="npc" onBack={vi.fn()} />)

    const legalMove = screen.getAllByRole('gridcell', { name: '可以落子的格子' })[0]!
    fireEvent.click(legalMove)

    expect(screen.getAllByLabelText('白棋想一想').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('gridcell', { name: '可以落子的格子' }).every((cell) => (cell as HTMLButtonElement).disabled)).toBe(true)
  })

  it('雙人同樂會依目前執棋方切換翻子提示的文字與語音文案', () => {
    render(<ReversiArtProposal mode="local" onBack={vi.fn()} />)

    expect(screen.getByLabelText(getChildText('reversi.flip_hint').text_zh_tw)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('gridcell', { name: '可以落子的格子' })[0]!)

    expect(screen.getByLabelText(getChildText('reversi.flip_hint_white').text_zh_tw)).toBeInTheDocument()
    expect(getChildText('reversi.flip_hint_white').speech_zh_tw).toBe('包住黑棋，翻成白棋')
  })

  it('點選合法落點會套用正式規則核心並翻轉棋子', () => {
    const { container } = render(<ReversiArtProposal onBack={vi.fn()} />)
    const scoreItems = document.querySelectorAll('.reversi-score__item')
    expect(scoreItems[0]).toHaveClass('reversi-score__item--active')
    expect(scoreItems[1]).toHaveClass('reversi-score__item--inactive')
    expect(container.querySelector('.reversi-turn')).toHaveAttribute('aria-label', '黑棋先走')

    fireEvent.click(screen.getAllByRole('gridcell', { name: '可以落子的格子' })[0]!)

    expect(screen.getByLabelText('黑棋 4，白棋 1')).toBeInTheDocument()
    expect(scoreItems[0]).toHaveClass('reversi-score__item--inactive')
    expect(scoreItems[1]).toHaveClass('reversi-score__item--active')
    expect(container.querySelector('.reversi-turn')).toHaveAttribute('aria-label', '白棋下')
  })

  it('自動略過與終局會顯示正向的兒童文案', () => {
    render(<ReversiArtProposal mode="local" onBack={vi.fn()} />)

    let sawForcedPass = false
    let sawResult = false
    for (let turn = 0; turn < 64 && !sawResult; turn += 1) {
      const legalCells = screen.queryAllByRole('gridcell', { name: '可以落子的格子' })
      if (legalCells.length === 0) break
      fireEvent.click(legalCells[0]!)
      sawForcedPass = sawForcedPass || Boolean(screen.queryByLabelText(getChildText('reversi.forced_pass').text_zh_tw))
      const hasResultLabel = (id: string) =>
        screen.queryAllByLabelText(getChildText(id).text_zh_tw).length > 0
      sawResult =
        hasResultLabel('reversi.result_black') ||
        hasResultLabel('reversi.result_white') ||
        hasResultLabel('reversi.result_draw')
    }

    expect(sawForcedPass).toBe(true)
    expect(sawResult).toBe(true)
    expect(screen.getByRole('button', { name: /再玩一次/ })).toBeInTheDocument()
    expect(document.querySelector('.feedback-card--positive')).toBeInTheDocument()
  }, 30_000)
})
