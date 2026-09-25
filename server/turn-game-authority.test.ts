import { describe, expect, it } from 'vitest'
import { createTurnRoom, applyTurnRoomStep, restartTurnRoom, nextTurnRole, type TrustedTurnGameId } from './turn-game-authority'
import { animalChessOnlineRules, gomokuOnlineRules, reversiOnlineRules, ticTacToeOnlineRules } from '../src/online/turn-rules'
import { chooseOnlineNumberGemCell, numberGemOnlineRules } from '../src/online/number-gem-turn-rules'
import { getLegalAnimalChessMoves, applyAnimalChessMove } from '../src/games/animal-chess/rules'
import { getLegalGomokuMoves, playGomokuMove } from '../src/games/gomoku/rules'
import { getLegalReversiMoves, applyReversiMove } from '../src/games/reversi/rules'
import { getLegalTicTacToeMoves, playTicTacToeMove } from '../src/games/tic-tac-toe/rules'

const legalFirstStep: Record<TrustedTurnGameId, () => string> = {
  'animal-chess': () => {
    const state = animalChessOnlineRules.initial()
    return animalChessOnlineRules.serialize(applyAnimalChessMove(state, getLegalAnimalChessMoves(state)[0]!))
  },
  gomoku: () => {
    const state = gomokuOnlineRules.initial()
    return gomokuOnlineRules.serialize(playGomokuMove(state, getLegalGomokuMoves(state)[0]!))
  },
  'number-gem': () => {
    const state = numberGemOnlineRules.initial()
    const next = state.state.puzzle.board.map((_, index) => chooseOnlineNumberGemCell(state, index))
      .find((candidate) => numberGemOnlineRules.serialize(candidate) !== numberGemOnlineRules.serialize(state))!
    return numberGemOnlineRules.serialize(next)
  },
  reversi: () => {
    const state = reversiOnlineRules.initial()
    return reversiOnlineRules.serialize(applyReversiMove(state, getLegalReversiMoves(state)[0]!))
  },
  'tic-tac-toe': () => {
    const state = ticTacToeOnlineRules.initial()
    return ticTacToeOnlineRules.serialize(playTicTacToeMove(state, getLegalTicTacToeMoves(state)[0]!))
  },
}

describe('五款棋類的可信回合規則', () => {
  for (const gameId of Object.keys(legalFirstStep) as TrustedTurnGameId[]) {
    it(`${gameId} 僅接受甲端由規則核心重算的第一步`, () => {
      const room = createTurnRoom(gameId)
      expect(nextTurnRole(room)).toBe('host')
      const next = legalFirstStep[gameId]()
      expect(() => applyTurnRoomStep(room, 'guest', 0, next)).toThrow('不合法')
      expect(() => applyTurnRoomStep(room, 'host', 0, room.serialized)).toThrow('不合法')
      const moved = applyTurnRoomStep(room, 'host', 0, next)
      expect(moved.revision).toBe(1)
      expect(() => applyTurnRoomStep(moved, 'host', 0, next)).toThrow('局面已更新')
      expect(() => restartTurnRoom(moved, 'guest', 1)).toThrow('第一位玩家')
      const restarted = restartTurnRoom(moved, 'host', 1)
      expect(restarted.revision).toBe(2)
      expect(restarted.serialized).toBe(room.serialized)
    })
  }
})
