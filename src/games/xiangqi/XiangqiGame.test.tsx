import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getChildText } from '../../content/child-text'
import { XiangqiGame } from './XiangqiGame'
import type { XiangqiAdventureSession, XiangqiAdventureStorage } from './storage'

async function waitForTutorialReady() {
  await waitFor(() => expect(screen.getByRole('gridcell', { name: '紅兵，7列1行' })).toBeEnabled())
}

describe('象棋冒險教學介面', () => {
  it('冒險入口顯示六段課程與逐字注音，不會誤啟動 NPC', () => {
    const { container } = render(<XiangqiGame mode="adventure" onBack={vi.fn()} />)
    const board = screen.getByRole('grid', { name: getChildText('xiangqi.title').text_zh_tw })
    const lessons = screen.getByRole('group', { name: getChildText('home.adventure').text_zh_tw })

    return waitForTutorialReady().then(() => {
    expect(within(lessons).getAllByRole('button')).toHaveLength(6)
    expect(within(lessons).getByRole('button', { name: getChildText('xiangqi.lesson_1_title').speech_zh_tw })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(getChildText('xiangqi.lesson_1_instruction').text_zh_tw)).toBeInTheDocument()
    expect(within(board).getByRole('gridcell', { name: '紅兵，7列1行' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '選擇難度' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-bopomofo-pair]').length).toBeGreaterThan(20)
    })
  })

  it('完成第一個互動任務後能前往下一段，且棋面不遮擋觸控目標', async () => {
    render(<XiangqiGame mode="adventure" onBack={vi.fn()} />)
    await waitForTutorialReady()
    const board = screen.getByRole('grid', { name: getChildText('xiangqi.title').text_zh_tw })
    fireEvent.click(within(board).getByRole('gridcell', { name: '紅兵，7列1行' }))
    fireEvent.click(within(board).getByRole('gridcell', { name: '6列1行，可走' }))

    expect(screen.getByLabelText(getChildText('xiangqi.lesson_success').text_zh_tw)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: getChildText('reversi.adventure_next').text_zh_tw }))
    expect(screen.getByLabelText(getChildText('xiangqi.lesson_2_instruction').text_zh_tw)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: getChildText('xiangqi.lesson_2_title').speech_zh_tw })).toHaveAttribute('aria-pressed', 'true')
  })

  it('答錯時保留教學局面，讓孩子可再選一次', async () => {
    render(<XiangqiGame mode="adventure" onBack={vi.fn()} />)
    await waitForTutorialReady()
    const board = screen.getByRole('grid', { name: getChildText('xiangqi.title').text_zh_tw })
    fireEvent.click(within(board).getByRole('gridcell', { name: '紅帥，10列5行' }))
    fireEvent.click(within(board).getByRole('gridcell', { name: '9列5行，可走' }))

    expect(screen.getByLabelText(getChildText('xiangqi.lesson_try_again').text_zh_tw)).toBeInTheDocument()
    expect(within(board).getByRole('gridcell', { name: '紅帥，10列5行' })).toBeInTheDocument()
  })

  it('將課程進度保存在離線儲存，重新開啟後回到已到達的段落', async () => {
    let stored: XiangqiAdventureSession | null = null
    const storage: XiangqiAdventureStorage = {
      load: vi.fn(async () => stored),
      save: vi.fn(async (session) => { stored = { ...session, completedLevelIds: [...session.completedLevelIds] } }),
      clear: vi.fn(async () => { stored = null }),
    }

    const first = render(<XiangqiGame mode="adventure" onBack={vi.fn()} adventureStorage={storage} />)
    await waitForTutorialReady()
    const board = screen.getByRole('grid', { name: getChildText('xiangqi.title').text_zh_tw })
    fireEvent.click(within(board).getByRole('gridcell', { name: '紅兵，7列1行' }))
    fireEvent.click(within(board).getByRole('gridcell', { name: '6列1行，可走' }))
    fireEvent.click(screen.getByRole('button', { name: getChildText('reversi.adventure_next').text_zh_tw }))
    await waitFor(() => expect(stored?.levelIndex).toBe(1))
    first.unmount()

    render(<XiangqiGame mode="adventure" onBack={vi.fn()} adventureStorage={storage} />)
    await waitFor(() => expect(screen.getByLabelText(getChildText('xiangqi.lesson_2_instruction').text_zh_tw)).toBeInTheDocument())
  })
})
