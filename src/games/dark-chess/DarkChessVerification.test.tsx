import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DarkChessVerification } from './DarkChessVerification'

describe('暗棋規則驗證預覽', () => {
  it('可用 49 步快速局面實際走一步並看見 50 步自動和局', () => {
    render(<DarkChessVerification onBack={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '49 步再走即和' }))
    fireEvent.click(screen.getByRole('gridcell', { name: '第 1 格，紅方俥' }))
    fireEvent.click(screen.getByRole('gridcell', { name: '第 2 格，空格' }))

    expect(screen.getByText('自動和局（50 步）')).toBeInTheDocument()
    expect(screen.getByText('連續未翻／未吃')).toBeInTheDocument()
  })

  it('可用 40 步快速局面實際套用 NPC 接受提和', () => {
    render(<DarkChessVerification onBack={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'NPC 提和回應' }))
    fireEvent.click(screen.getByRole('button', { name: '40 步 NPC 接受' }))
    fireEvent.click(screen.getByRole('button', { name: '提議和局' }))
    expect(screen.getByText('NPC 預計回覆：接受和局')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '套用 NPC 回覆' }))

    expect(screen.getByText('合意和局')).toBeInTheDocument()
  })
})
