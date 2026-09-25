import { describe, expect, it } from 'vitest'
import { applyDarkChessRoomAction, createDarkChessRoom, publicDarkChessRoom, restartDarkChessRoom } from './dark-chess-authority'

describe('暗棋可信局面與公開遮蔽', () => {
  it('公開資料不包含亂數種子、棋子 ID 與未翻開的顏色種類', () => {
    const room = createDarkChessRoom(0x12345678)
    const view = publicDarkChessRoom(room)
    expect(view.state.board.filter(Boolean)).toHaveLength(32)
    expect(view.state.board.every((piece) => piece === null || (!piece.revealed && piece.color === null && piece.kind === null))).toBe(true)
    expect(JSON.stringify(view)).not.toContain('seed')
    expect(JSON.stringify(view)).not.toContain('pieces')
  })

  it('僅甲能翻第一步，乙只能在更新後走，拒絕過期版本', () => {
    const room = createDarkChessRoom(0x12345678)
    expect(() => applyDarkChessRoomAction(room, 'guest', 0, { kind: 'flip', cell: 0 })).toThrow('輪到')
    const flipped = applyDarkChessRoomAction(room, 'host', 0, { kind: 'flip', cell: 0 })
    expect(flipped.revision).toBe(1)
    expect(publicDarkChessRoom(flipped).state.board[0]?.revealed).toBe(true)
    expect(() => applyDarkChessRoomAction(flipped, 'guest', 0, { kind: 'flip', cell: 1 })).toThrow('局面已更新')
    expect(applyDarkChessRoomAction(flipped, 'guest', 1, { kind: 'flip', cell: 1 }).revision).toBe(2)
  })

  it('只有甲能重開，重開後仍不外洩蓋牌', () => {
    const room = createDarkChessRoom(123)
    expect(() => restartDarkChessRoom(room, 'guest', 456)).toThrow('第一位玩家')
    const restarted = restartDarkChessRoom(room, 'host', 456)
    expect(restarted.revision).toBe(1)
    expect(publicDarkChessRoom(restarted).state.board.every((piece) => piece === null || piece.color === null)).toBe(true)
  })
})
