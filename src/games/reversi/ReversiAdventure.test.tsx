import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getChildText } from '../../content/child-text'
import { ReversiAdventure } from './ReversiAdventure'
import type { ReversiStorage } from './storage'

function createStorage(): ReversiStorage {
  return {
    clear: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

describe('黑白棋冒險互動教學畫面', () => {
  it('顯示六關固定課程、四個合法開局與逐字注音，不顯示 NPC 難度', () => {
    const { container } = render(<ReversiAdventure onBack={vi.fn()} storage={createStorage()} />)
    const board = screen.getByRole('grid', { name: '黑白棋' })

    expect(screen.getByRole('main', { name: getChildText('reversi.adventure_title').text_zh_tw })).toBeInTheDocument()
    expect(within(board).getAllByRole('gridcell', { name: '可以落子的格子' })).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: /第一關認識開局|第二關包住一條線|第三關翻好多方向|第四關保護角落|第五關自動換手|第六關獨立短局/ })).toHaveLength(6)
    expect(screen.queryByRole('group', { name: '選擇難度' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-bopomofo-pair]').length).toBeGreaterThan(20)
  })

  it('第二關提示只留下唯一合法落點，避免兒童以為棋盤沒有下子處', () => {
    render(<ReversiAdventure onBack={vi.fn()} storage={createStorage()} />)
    fireEvent.click(screen.getByRole('button', { name: '第二關包住一條線' }))

    const board = screen.getByRole('grid', { name: '黑白棋' })
    fireEvent.click(screen.getByRole('button', { name: '提示' }))
    fireEvent.click(screen.getByRole('button', { name: '提示' }))
    fireEvent.click(screen.getByRole('button', { name: '提示' }))
    expect(board.querySelectorAll('.reversi-cell--suggested')).toHaveLength(1)
    expect(within(board).getAllByRole('gridcell', { name: '可以落子的格子' })).toHaveLength(1)
  })

  it('第三關錯誤落子會保留在本關', () => {
    render(<ReversiAdventure onBack={vi.fn()} storage={createStorage()} />)
    fireEvent.click(screen.getByRole('button', { name: '第三關翻好多方向' }))

    const board = screen.getByRole('grid', { name: '黑白棋' })
    fireEvent.click(within(board).getAllByRole('gridcell', { name: '可以落子的格子' })[0]!)
    expect(screen.getByLabelText(getChildText('reversi.adventure_try_again').text_zh_tw)).toBeInTheDocument()
  })

  it('完成正確一步後由固定入門 NPC 接手，完成本關並提供下一關', async () => {
    render(<ReversiAdventure onBack={vi.fn()} storage={createStorage()} />)
    const board = screen.getByRole('grid', { name: '黑白棋' })
    fireEvent.click(within(board).getAllByRole('gridcell', { name: '可以落子的格子' })[0]!)

    expect(screen.getAllByLabelText(getChildText('reversi.npc_thinking').text_zh_tw).length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getByLabelText(getChildText('reversi.adventure_complete').text_zh_tw)).toBeInTheDocument()
    }, { timeout: 3000 })
    expect(screen.getByRole('button', { name: getChildText('reversi.adventure_next').text_zh_tw })).toBeInTheDocument()
  })

  it('教學完成語音文案的「卡」使用台灣注音ㄎㄚˇ', () => {
    const entry = getChildText('reversi.adventure_complete')

    expect(entry.speech_zh_tw).toBe('你完成了一個教學關卡')
    expect(entry.segments.find((segment) => segment.text === '卡')).toEqual({ text: '卡', bopomofo: 'ㄎㄚˇ' })
  })

  it('第五關開場直接呈現規則造成的自動略過狀態', () => {
    render(<ReversiAdventure onBack={vi.fn()} storage={createStorage()} />)
    fireEvent.click(screen.getByRole('button', { name: '第五關自動換手' }))

    expect(screen.getByLabelText(getChildText('reversi.forced_pass').text_zh_tw)).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell', { name: '可以落子的格子' })).toHaveLength(3)
  })
})
