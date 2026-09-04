import { describe, expect, it } from 'vitest'
import {
  DARK_CHESS_AUTO_DRAW_STEPS,
  DARK_CHESS_BOARD_CELLS,
  DARK_CHESS_NPC_DRAW_ACCEPT_STEPS,
  applyDarkChessAction,
  createDarkChessState,
  deserializeDarkChessState,
  getLegalDarkChessActions,
  getLegalDarkChessActionsForPlayer,
  getLegalPublicDarkChessActions,
  getLegalPublicDarkChessActionsForPlayer,
  getNpcDrawResponse,
  getPublicDarkChessState,
  replayDarkChessTurns,
  serializeDarkChessState,
  type DarkChessCell,
  type DarkChessColor,
  type DarkChessPiece,
  type DarkChessPlayer,
  type DarkChessState,
} from './rules'

interface PlacedPiece {
  readonly id: string
  readonly cell: number
  readonly revealed?: boolean
}

function fixture(
  placed: readonly PlacedPiece[],
  options: { readonly currentPlayer?: DarkChessPlayer; readonly quietStreak?: number } = {},
): DarkChessState {
  const base = createDarkChessState(0x12345678)
  const board = Array<DarkChessCell>(DARK_CHESS_BOARD_CELLS).fill(null)
  for (const piece of placed) board[piece.cell] = piece.id
  const placedIds = new Set(placed.map((piece) => piece.id))
  const pieces = base.pieces.map((piece) => placedIds.has(piece.id)
    ? { ...piece, revealed: placed.find((placedPiece) => placedPiece.id === piece.id)?.revealed ?? true }
    : piece)
  return {
    ...base,
    board,
    pieces,
    currentPlayer: options.currentPlayer ?? 'player1',
    playerColors: { player1: 'red', player2: 'black' },
    quietStreak: options.quietStreak ?? 0,
  }
}

function pieceColor(state: DarkChessState, id: string): DarkChessColor {
  const piece = state.pieces.find((candidate) => candidate.id === id)
  if (piece === undefined) throw new Error(`測試棋子不存在：${id}`)
  return piece.color
}

describe('台灣暗棋規則核心', () => {
  it('建立 4×8、32 枚全部背面的局面，固定種子可重現洗牌', () => {
    const first = createDarkChessState(123)
    const second = createDarkChessState(123)
    const different = createDarkChessState(124)

    expect(first.board).toHaveLength(32)
    expect(first.pieces).toHaveLength(32)
    expect(first.board.every((cell) => cell !== null)).toBe(true)
    expect(first.pieces.every((piece) => piece.revealed === false)).toBe(true)
    expect(first.board).toEqual(second.board)
    expect(first.board).not.toEqual(different.board)
    expect(first.currentPlayer).toBe('player1')
    expect(getLegalDarkChessActions(first)).toHaveLength(32)
  })

  it('第一枚翻出的棋子決定第一位玩家陣營，並在回合後交給另一位玩家', () => {
    const state = createDarkChessState(1)
    const firstPiece = state.pieces.find((piece) => piece.id === state.board[0]) as DarkChessPiece
    const next = applyDarkChessAction(state, { kind: 'flip', cell: 0 })

    expect(next.playerColors.player1).toBe(firstPiece.color)
    expect(next.playerColors.player2).toBe(firstPiece.color === 'red' ? 'black' : 'red')
    expect(next.currentPlayer).toBe('player2')
    expect(next.quietStreak).toBe(0)
    expect(next.pieces.find((piece) => piece.id === firstPiece.id)?.revealed).toBe(true)
  })

  it('普通棋子只能直向相鄰移動，並依階級與特殊規則吃子', () => {
    const moveState = fixture([
      { id: 'red-chariot-1', cell: 5 },
      { id: 'black-general-1', cell: 31 },
    ])
    expect(getLegalDarkChessActions(moveState)).toContainEqual({ kind: 'move', from: 5, to: 1 })
    expect(getLegalDarkChessActions(moveState)).not.toContainEqual({ kind: 'move', from: 5, to: 10 })

    const captureState = fixture([
      { id: 'red-chariot-1', cell: 5 },
      { id: 'black-horse-1', cell: 6 },
      { id: 'black-soldier-1', cell: 31 },
    ])
    expect(getLegalDarkChessActions(captureState)).toContainEqual({ kind: 'capture', from: 5, to: 6 })

    const soldierCannotTakeHorse = fixture([
      { id: 'red-soldier-1', cell: 5 },
      { id: 'black-horse-1', cell: 6 },
      { id: 'black-soldier-1', cell: 31 },
    ])
    expect(getLegalDarkChessActions(soldierCannotTakeHorse)).not.toContainEqual({ kind: 'capture', from: 5, to: 6 })

    const soldiersCanCaptureEachOther = fixture([
      { id: 'red-soldier-1', cell: 5 },
      { id: 'black-soldier-1', cell: 6 },
      { id: 'black-general-1', cell: 31 },
    ])
    expect(getLegalDarkChessActions(soldiersCanCaptureEachOther)).toContainEqual({ kind: 'capture', from: 5, to: 6 })

    const largerPieceCanTakeSoldier = fixture([
      { id: 'red-horse-1', cell: 5 },
      { id: 'black-soldier-1', cell: 6 },
      { id: 'black-general-1', cell: 31 },
    ])
    expect(getLegalDarkChessActions(largerPieceCanTakeSoldier)).toContainEqual({ kind: 'capture', from: 5, to: 6 })

    const generalCannotTakeSoldier = fixture([
      { id: 'red-general-1', cell: 5 },
      { id: 'black-soldier-1', cell: 6 },
      { id: 'black-general-1', cell: 31 },
    ])
    expect(getLegalDarkChessActions(generalCannotTakeSoldier)).not.toContainEqual({ kind: 'capture', from: 5, to: 6 })

    const soldierTakesGeneral = fixture([
      { id: 'red-soldier-1', cell: 5 },
      { id: 'black-general-1', cell: 6 },
      { id: 'black-soldier-1', cell: 31 },
    ])
    expect(getLegalDarkChessActions(soldierTakesGeneral)).toContainEqual({ kind: 'capture', from: 5, to: 6 })
  })

  it('炮只能平移一格，吃子時可隔一枚明／暗棋吃掉敵方明棋', () => {
    const state = fixture([
      { id: 'red-cannon-1', cell: 0 },
      { id: 'black-soldier-1', cell: 1, revealed: false },
      { id: 'black-horse-1', cell: 3 },
      { id: 'black-general-1', cell: 31 },
    ])
    const actions = getLegalDarkChessActions(state)

    expect(actions).toContainEqual({ kind: 'capture', from: 0, to: 3 })
    expect(actions).not.toContainEqual({ kind: 'capture', from: 0, to: 1 })
    expect(actions).not.toContainEqual({ kind: 'capture', from: 0, to: 2 })
  })

  it('連續 50 步沒有翻棋或吃子時自動和局，步數為雙方合計', () => {
    let state = fixture([
      { id: 'red-soldier-1', cell: 0 },
      { id: 'black-soldier-1', cell: 31 },
    ])

    for (let cycle = 0; cycle < 25; cycle += 1) {
      state = applyDarkChessAction(state, { kind: 'move', from: cycle % 2 === 0 ? 0 : 1, to: cycle % 2 === 0 ? 1 : 0 })
      state = applyDarkChessAction(state, { kind: 'move', from: cycle % 2 === 0 ? 31 : 30, to: cycle % 2 === 0 ? 30 : 31 })
    }

    expect(state.quietStreak).toBe(DARK_CHESS_AUTO_DRAW_STEPS)
    expect(state.phase).toBe('draw')
    expect(state.drawReason).toBe('automatic-50-steps')
    expect(state.winner).toBeNull()
  })

  it('翻棋或吃子會把雙方共用的連續計數歸零', () => {
    const hiddenState = { ...createDarkChessState(7), quietStreak: 12 }
    const flipped = applyDarkChessAction(hiddenState, { kind: 'flip', cell: 0 })
    expect(flipped.quietStreak).toBe(0)

    const captureState = fixture([
      { id: 'red-chariot-1', cell: 0 },
      { id: 'black-horse-1', cell: 1 },
      { id: 'black-soldier-1', cell: 31 },
    ], { quietStreak: 12 })
    const captured = applyDarkChessAction(captureState, { kind: 'capture', from: 0, to: 1 })
    expect(captured.quietStreak).toBe(0)
  })

  it('NPC 未滿 40 步拒絕提和，達到 40 步接受提和', () => {
    const before = applyDarkChessAction(fixture([
      { id: 'red-soldier-1', cell: 0 },
      { id: 'black-soldier-1', cell: 31 },
    ], { quietStreak: DARK_CHESS_NPC_DRAW_ACCEPT_STEPS - 1 }), { kind: 'draw-offer' })
    expect(before.currentPlayer).toBe('player2')
    expect(getNpcDrawResponse(before)).toBe('reject')
    const rejected = applyDarkChessAction(before, { kind: 'draw-response', response: 'reject' })
    expect(rejected.phase).toBe('playing')
    expect(rejected.currentPlayer).toBe('player1')

    const atThreshold = applyDarkChessAction(fixture([
      { id: 'red-soldier-1', cell: 0 },
      { id: 'black-soldier-1', cell: 31 },
    ], { quietStreak: DARK_CHESS_NPC_DRAW_ACCEPT_STEPS }), { kind: 'draw-offer' })
    expect(getNpcDrawResponse(atThreshold)).toBe('accept')
    const accepted = applyDarkChessAction(atThreshold, { kind: 'draw-response', response: 'accept' })
    expect(accepted.phase).toBe('draw')
    expect(accepted.drawReason).toBe('agreement')
  })

  it('雙人同樂不受 40 步限制，對方接受提和即可和局', () => {
    const offered = applyDarkChessAction(fixture([
      { id: 'red-soldier-1', cell: 0 },
      { id: 'black-soldier-1', cell: 31 },
    ]), { kind: 'draw-offer' })
    const accepted = applyDarkChessAction(offered, { kind: 'draw-response', response: 'accept' })

    expect(accepted.phase).toBe('draw')
    expect(accepted.drawReason).toBe('agreement')
  })

  it('公開局面遮罩尚未翻開的棋子，不讓 NPC 取得顏色與種類', () => {
    const state = createDarkChessState(22)
    const publicState = getPublicDarkChessState(state)
    const hidden = publicState.board.find((cell) => cell !== null)

    expect(hidden).toEqual({ revealed: false, color: null, kind: null })
    const revealed = applyDarkChessAction(state, { kind: 'flip', cell: 0 })
    const publicRevealed = getPublicDarkChessState(revealed)
    expect(publicRevealed.board[0]).toEqual({
      revealed: true,
      color: pieceColor(state, state.board[0] as string),
      kind: revealed.pieces.find((piece) => piece.id === state.board[0])?.kind,
    })
  })

  it('公開行動清單只允許翻開暗棋，並依公開棋面產生走子、吃子與炮架', () => {
    const state = fixture([
      { id: 'red-cannon-1', cell: 0 },
      { id: 'black-soldier-1', cell: 1, revealed: false },
      { id: 'black-horse-1', cell: 3 },
    ])
    const publicState = getPublicDarkChessState(state)
    const publicActions = getLegalPublicDarkChessActions(publicState)
    expect(publicActions).toContainEqual({ kind: 'flip', cell: 1 })
    expect(publicActions).toContainEqual({ kind: 'capture', from: 0, to: 3 })
    expect(publicActions).not.toContainEqual({ kind: 'capture', from: 0, to: 1 })
    expect(getLegalPublicDarkChessActionsForPlayer(publicState, 'player2')).not.toContainEqual({ kind: 'capture', from: 0, to: 3 })
  })

  it('提和、拒絕與回合紀錄可序列化並完整重播', () => {
    let state = createDarkChessState(99)
    state = applyDarkChessAction(state, { kind: 'flip', cell: 0 })
    state = applyDarkChessAction(state, { kind: 'draw-offer' })
    state = applyDarkChessAction(state, { kind: 'draw-response', response: 'reject' })

    const restored = deserializeDarkChessState(serializeDarkChessState(state))
    expect(restored).toEqual(state)
    expect(replayDarkChessTurns(state.seed, state.turns)).toEqual(state)
    expect(() => deserializeDarkChessState(JSON.stringify({ ...state, quietStreak: 99 }))).toThrow('不一致')
    expect(() => deserializeDarkChessState('{壞掉')).toThrow('不是有效的 JSON')
  })

  it('不能在提和等待回應時繼續下棋，也不能在終局後操作', () => {
    const offered = applyDarkChessAction(fixture([
      { id: 'red-soldier-1', cell: 0 },
      { id: 'black-soldier-1', cell: 31 },
    ]), { kind: 'draw-offer' })
    expect(getLegalDarkChessActions(offered)).toEqual([])
    expect(() => applyDarkChessAction(offered, { kind: 'move', from: 31, to: 30 })).toThrow('回應目前的和局提議')

    const ended = applyDarkChessAction(offered, { kind: 'draw-response', response: 'accept' })
    expect(() => applyDarkChessAction(ended, { kind: 'draw-offer' })).toThrow('已經結束')
    expect(getLegalDarkChessActionsForPlayer(ended, 'player1')).toEqual([])
  })
})
