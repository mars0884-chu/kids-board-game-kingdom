import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getChildText } from '../../content/child-text'
import { CommonUiPreview } from './CommonUiPreview'

describe('ART-004-r03 共用 UI 元件', () => {
  it('顯示三層操作、四階難度、回饋卡與共用工具', () => {
    render(<CommonUiPreview onBack={vi.fn()} />)

    expect(screen.getByRole('button', { name: '開始冒險' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再試一次' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提示' })).toBeInTheDocument()

    const difficultyGroup = screen.getByRole('group', { name: '選擇難度' })
    expect(within(difficultyGroup).getByRole('button', { name: '入門' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(difficultyGroup).getByRole('button', { name: '成長' })).toBeInTheDocument()
    expect(within(difficultyGroup).getByRole('button', { name: '挑戰' })).toBeInTheDocument()
    expect(within(difficultyGroup).getByRole('button', { name: '成人版' })).toBeInTheDocument()

    expect(screen.getByLabelText('看看棋盤中央')).toBeInTheDocument()
    expect(screen.getByLabelText('你發現一種走法')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '聽一聽' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暫停' })).toBeInTheDocument()
  })

  it('所有共用控制都標示 ART-013-r01 並使用同一組觸控、字級與圖示 token', () => {
    const { container } = render(<CommonUiPreview onBack={vi.fn()} />)
    const controls = [...container.querySelectorAll<HTMLButtonElement>('button[data-ui-standard="ART-013-r01"]')]

    expect(controls.length).toBeGreaterThanOrEqual(10)
    expect(controls.every((control) => control.style.borderRadius === 'var(--ui-control-radius)')).toBe(true)
    expect(controls.every((control) => control.style.gap === 'var(--ui-control-gap)')).toBe(true)
    expect(controls.every((control) => control.style.minHeight.startsWith('var(--ui-'))).toBe(true)
    expect(container.querySelectorAll('.difficulty-option__icon svg')).toHaveLength(4)
    expect(container.querySelector('.difficulty-selector[data-control-group="difficulty"]')).toHaveAttribute(
      'data-ui-standard',
      'ART-013-r01',
    )

    const labels = [...container.querySelectorAll<HTMLElement>('.child-control__label')]
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every((label) => label.style.fontSize === 'var(--ui-control-label-size)')).toBe(true)

    const icons = [...container.querySelectorAll<HTMLElement>('.child-control__icon')]
    expect(icons.every((icon) => icon.style.width === 'var(--ui-control-icon-size)')).toBe(true)
  })

  it('以外框、星形與 aria-pressed 同步更新四階難度選擇', () => {
    const { container } = render(<CommonUiPreview onBack={vi.fn()} />)
    const adult = screen.getByRole('button', { name: '成人版' })

    fireEvent.click(adult)

    expect(adult).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '入門' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('status')).toHaveAccessibleName('目前選擇：成人版')
    expect(container.querySelectorAll('[data-bopomofo-pair]').length).toBeGreaterThan(40)
  })

  it('回饋卡會以不打斷操作的方式通知新提示', () => {
    const { container } = render(<CommonUiPreview onBack={vi.fn()} />)
    const feedbackCard = container.querySelector('.feedback-card')

    expect(feedbackCard).toHaveAttribute('aria-live', 'polite')
    expect(feedbackCard).toHaveAttribute('aria-atomic', 'true')
  })

  it('返回工具可由上層流程重用，正式 UI 文案都有獨立語音鍵值', () => {
    const onBack = vi.fn()
    render(<CommonUiPreview onBack={onBack} />)

    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(onBack).toHaveBeenCalledOnce()

    const textIds = [
      'home.start',
      'common.try_again',
      'common.hint',
      'difficulty.beginner',
      'difficulty.growth',
      'difficulty.challenge',
      'difficulty.adult',
      'feedback.hint_center',
      'feedback.discovery',
      'common.back',
      'common.listen',
      'common.pause',
    ]

    for (const textId of textIds) {
      expect(getChildText(textId).audio_asset).toMatch(/^voice\//)
    }
  })
})
