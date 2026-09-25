import { describe, expect, it } from 'vitest'
import { animalChessOnlineRules, gomokuOnlineRules, reversiOnlineRules, ticTacToeOnlineRules } from './turn-rules'
import { applyAnimalChessMove, getLegalAnimalChessMoves } from '../games/animal-chess/rules'
import { getLegalGomokuMoves, playGomokuMove } from '../games/gomoku/rules'
import { applyReversiMove, getLegalReversiMoves } from '../games/reversi/rules'
import { getLegalTicTacToeMoves, playTicTacToeMove } from '../games/tic-tac-toe/rules'

describe('線上合法一步驗證', () => {
  it('動物棋只接受當前局面的一步合法走棋', () => {
    const before = animalChessOnlineRules.initial()
    const move = getLegalAnimalChessMoves(before)[0]!
    const next = applyAnimalChessMove(before, move)
    expect(animalChessOnlineRules.currentRole(before)).toBe('host')
    expect(animalChessOnlineRules.isLegalStep(before, next)).toBe(true)
    expect(animalChessOnlineRules.isLegalStep(before, before)).toBe(false)
    expect(animalChessOnlineRules.serialize(animalChessOnlineRules.deserialize(animalChessOnlineRules.serialize(next)))).toBe(animalChessOnlineRules.serialize(next))
  })

  it('五子棋保留黑方先手與禁手規則核心', () => {
    const before = gomokuOnlineRules.initial()
    const next = playGomokuMove(before, getLegalGomokuMoves(before)[0]!)
    expect(gomokuOnlineRules.currentRole(before)).toBe('host')
    expect(gomokuOnlineRules.currentRole(next)).toBe('guest')
    expect(gomokuOnlineRules.isLegalStep(before, next)).toBe(true)
    expect(gomokuOnlineRules.isLegalStep(before, before)).toBe(false)
  })

  it('黑白棋使用包含強制略過的既有規則引擎', () => {
    const before = reversiOnlineRules.initial()
    const next = applyReversiMove(before, getLegalReversiMoves(before)[0]!)
    expect(reversiOnlineRules.currentRole(before)).toBe('host')
    expect(reversiOnlineRules.isLegalStep(before, next)).toBe(true)
    expect(reversiOnlineRules.isLegalStep(before, before)).toBe(false)
  })

  it('井字棋只接受一個空格的合法落子', () => {
    const before = ticTacToeOnlineRules.initial()
    const next = playTicTacToeMove(before, getLegalTicTacToeMoves(before)[0]!)
    expect(ticTacToeOnlineRules.currentRole(before)).toBe('host')
    expect(ticTacToeOnlineRules.currentRole(next)).toBe('guest')
    expect(ticTacToeOnlineRules.isLegalStep(before, next)).toBe(true)
    expect(ticTacToeOnlineRules.isLegalStep(before, before)).toBe(false)
  })
})
