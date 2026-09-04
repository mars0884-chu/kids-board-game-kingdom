import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { getChildText } from './content/child-text'

const text = (id: string) => getChildText(id).text_zh_tw

afterEach(() => window.history.replaceState({}, '', '/'))

describe('主入口遊戲選擇', () => {
  it('可先選模式，再選井字棋、五子棋、黑白棋或暗棋', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: text('app.title') })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: text('home.adventure') }))
    expect(screen.getByLabelText(text('ui.choose_game'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: text('tictactoe.title') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: text('gomoku.title') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: text('reversi.title') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暗棋' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '動物棋' })).toBeInTheDocument()
  })

  it('可由棋類選擇畫面直接開啟動物棋完整 7×9 版本', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: text('home.adventure') }))
    fireEvent.click(screen.getByRole('button', { name: '動物棋' }))

    expect(screen.getByRole('grid', { name: '動物棋' })).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(63)
  })

  it('可由棋類選擇畫面直接開啟黑白棋冒險教學', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: text('home.adventure') }))
    fireEvent.click(screen.getByRole('button', { name: text('reversi.title') }))

    expect(screen.getByRole('main', { name: text('reversi.adventure_title') })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: text('reversi.title') })).toBeInTheDocument()
  })

  it('黑白棋冒險闖關會進入教學並由入門 NPC 接手白棋', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: text('home.adventure') }))
    fireEvent.click(screen.getByRole('button', { name: text('reversi.title') }))

    expect(screen.getByLabelText(text('reversi.mode_adventure'))).toBeInTheDocument()
    expect(screen.getByLabelText(text('reversi.adventure_instruction_opening'))).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /第一關認識開局|第二關包住一條線|第三關翻好多方向|第四關保護角落|第五關自動換手|第六關獨立短局/ })).toHaveLength(6)
    expect(screen.queryByRole('group', { name: text('ui.choose_difficulty') })).not.toBeInTheDocument()
  })

  it('黑白棋自由練習會顯示四階 NPC 難度', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: text('home.practice') }))
    fireEvent.click(screen.getByRole('button', { name: text('reversi.title') }))

    expect(screen.getByLabelText(text('reversi.mode_practice'))).toBeInTheDocument()
    expect(screen.getByRole('group', { name: text('ui.choose_difficulty') })).toBeInTheDocument()
    expect(screen.getByLabelText(text('reversi.choose_move'))).toBeInTheDocument()
  })

  it('黑白棋雙人同樂由黑白雙方手動操作且不顯示 NPC 難度', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: text('home.two_player') }))
    fireEvent.click(screen.getByRole('button', { name: text('reversi.title') }))

    expect(screen.getByLabelText(text('reversi.mode_local'))).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: text('ui.choose_difficulty') })).not.toBeInTheDocument()
  })

  it('五子棋冒險闖關顯示固定任務，不混入 NPC 難度', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: text('home.adventure') }))
    fireEvent.click(screen.getByRole('button', { name: text('gomoku.title') }))

    expect(screen.getByRole('heading', { name: '星光任務' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /第一關連成五子|第二關守住連線|第三關打開四子|第四關避開禁手/ })).toHaveLength(4)
    expect(screen.queryByRole('group', { name: text('ui.choose_difficulty') })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: text('common.back') }))
    fireEvent.click(screen.getByRole('button', { name: text('common.back') }))
    fireEvent.click(screen.getByRole('button', { name: text('home.two_player') }))
    fireEvent.click(screen.getByRole('button', { name: text('tictactoe.title') }))
    expect(screen.getByRole('button', { name: text('difficulty.beginner') })).toBeEnabled()
    expect(screen.getByRole('button', { name: text('difficulty.growth') })).toBeEnabled()
    expect(screen.getByRole('button', { name: text('difficulty.challenge') })).toBeEnabled()
    expect(screen.getByRole('button', { name: text('difficulty.adult') })).toBeEnabled()
  })

  it('從五子棋返回時會回到選擇棋類畫面，不會跳到井字棋', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: text('home.adventure') }))
    fireEvent.click(screen.getByRole('button', { name: text('gomoku.title') }))
    expect(screen.getByRole('grid', { name: text('gomoku.title') })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: text('common.back') }))
    expect(screen.getByRole('button', { name: text('gomoku.title') })).toBeInTheDocument()
    expect(screen.queryByRole('grid', { name: text('tictactoe.title') })).not.toBeInTheDocument()
  })

  it('自由練習保留可選的四階 NPC 難度', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: text('home.practice') }))
    fireEvent.click(screen.getByRole('button', { name: text('gomoku.title') }))
    expect(screen.getByRole('group', { name: text('ui.choose_difficulty') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: text('difficulty.beginner') })).toBeEnabled()
    expect(screen.getByRole('button', { name: text('difficulty.growth') })).toBeEnabled()
    expect(screen.getByRole('button', { name: text('difficulty.challenge') })).toBeEnabled()
    expect(screen.getByRole('button', { name: text('difficulty.adult') })).toBeEnabled()
  })

  it('ART-006-r04 正式美術以同一個十五乘十五交點棋盤呈現落在線上的棋子', () => {
    window.history.replaceState({}, '', '?preview=gomoku-art-proposal')
    const { container } = render(<App />)

    expect(container.querySelector('.gomoku-proposal--formal-r04')).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: text('gomoku.title') })).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(225)
    expect(container.querySelectorAll('.gomoku-cell--black .gomoku-stone')).toHaveLength(4)
    expect(container.querySelectorAll('.gomoku-cell--white .gomoku-stone')).toHaveLength(4)
  })

  it('可由驗證網址直接開啟暗棋規則實際畫面', () => {
    window.history.replaceState({}, '', '?preview=dark-chess-verification')
    render(<App />)

    expect(screen.getByRole('main', { name: '暗棋規則驗證預覽' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: '暗棋 4×8 棋盤' })).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(32)
  })

  it('可由跳棋正式美術提案入口開啟 121 孔實機畫面', () => {
    window.history.replaceState({}, '', '?preview=jump-chess-art-proposal')
    const { container } = render(<App />)

    expect(screen.getByRole('region', { name: text('jump_chess.title') })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: text('jump_chess.title') })).toBeInTheDocument()
    expect(container.querySelectorAll('.jump-chess-hole')).toHaveLength(121)
    expect(container.querySelectorAll('.jump-chess-piece--player-one')).toHaveLength(10)
    expect(container.querySelectorAll('.jump-chess-piece--player-two')).toHaveLength(10)
  })

  it('跳棋三種兒童模式分別接上教學、NPC 與同機雙人', () => {
    window.history.replaceState({}, '', '?preview=jump-chess-adventure')
    const adventure = render(<App />)
    expect(screen.getByRole('region', { name: text('jump_chess.title') })).toBeInTheDocument()
    expect(adventure.container.querySelector('.jump-chess-tutorial-card')).toBeInTheDocument()
    adventure.unmount()

    window.history.replaceState({}, '', '?preview=jump-chess')
    const npc = render(<App />)
    expect(screen.getByRole('group', { name: text('ui.choose_difficulty') })).toBeInTheDocument()
    npc.unmount()

    window.history.replaceState({}, '', '?preview=jump-chess-local')
    render(<App />)
    expect(screen.queryByRole('group', { name: text('ui.choose_difficulty') })).not.toBeInTheDocument()
  })

  it('暗棋三種兒童模式各有可直接驗證的網址入口', () => {
    window.history.replaceState({}, '', '?preview=dark-chess-adventure')
    const adventure = render(<App />)
    expect(screen.getByRole('main', { name: '暗棋' })).toBeInTheDocument()
    expect(screen.getByLabelText('六個教學關卡')).toBeInTheDocument()
    adventure.unmount()

    window.history.replaceState({}, '', '?preview=dark-chess-child')
    const practice = render(<App />)
    expect(screen.getByRole('group', { name: text('ui.choose_difficulty') })).toBeInTheDocument()
    practice.unmount()

    window.history.replaceState({}, '', '?preview=dark-chess-local')
    render(<App />)
    expect(screen.getByRole('main', { name: text('dark_chess.title') })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: text('ui.choose_difficulty') })).not.toBeInTheDocument()
  })

  it('可由正式美術提案入口查驗暗棋的實體棋子與四乘八棋盤', () => {
    window.history.replaceState({}, '', '?preview=dark-chess-art-proposal')
    const { container } = render(<App />)

    expect(screen.getByRole('main', { name: '暗棋' })).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(32)
    expect(container.querySelectorAll('.dark-chess-piece--red, .dark-chess-piece--black').length).toBeGreaterThan(0)
  })

  it('黑白棋提案網址不會誤顯示暗棋畫面', () => {
    window.history.replaceState({}, '', '?preview=reversi-art-proposal&verification=1')
    const { container } = render(<App />)

    expect(container.querySelector('.reversi-art-proposal')).toBeInTheDocument()
    expect(container.querySelector('.dark-chess-game')).not.toBeInTheDocument()
  })
})
