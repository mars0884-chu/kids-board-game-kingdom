import type { TurnGamePhase, TurnGameRules } from '../core/turn-game'

export type DarkChessColor = 'red' | 'black'
export type DarkChessPlayer = 'player1' | 'player2'
export type DarkChessPieceKind = 'general' | 'advisor' | 'elephant' | 'chariot' | 'horse' | 'cannon' | 'soldier'
export type DarkChessCell = string | null

export const DARK_CHESS_BOARD_WIDTH = 4
export const DARK_CHESS_BOARD_HEIGHT = 8
export const DARK_CHESS_BOARD_CELLS = DARK_CHESS_BOARD_WIDTH * DARK_CHESS_BOARD_HEIGHT
export const DARK_CHESS_AUTO_DRAW_STEPS = 50
export const DARK_CHESS_NPC_DRAW_ACCEPT_STEPS = 40
export const DARK_CHESS_DEFAULT_SEED = 0x4b1d2e3f

const ORTHOGONAL_DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

const PIECE_RANK: Readonly<Record<DarkChessPieceKind, number>> = {
  soldier: 1,
  cannon: 2,
  horse: 3,
  chariot: 4,
  elephant: 5,
  advisor: 6,
  general: 7,
}

const PIECE_COUNTS: readonly { readonly color: DarkChessColor; readonly kind: DarkChessPieceKind; readonly count: number }[] = [
  { color: 'red', kind: 'general', count: 1 },
  { color: 'red', kind: 'advisor', count: 2 },
  { color: 'red', kind: 'elephant', count: 2 },
  { color: 'red', kind: 'chariot', count: 2 },
  { color: 'red', kind: 'horse', count: 2 },
  { color: 'red', kind: 'cannon', count: 2 },
  { color: 'red', kind: 'soldier', count: 5 },
  { color: 'black', kind: 'general', count: 1 },
  { color: 'black', kind: 'advisor', count: 2 },
  { color: 'black', kind: 'elephant', count: 2 },
  { color: 'black', kind: 'chariot', count: 2 },
  { color: 'black', kind: 'horse', count: 2 },
  { color: 'black', kind: 'cannon', count: 2 },
  { color: 'black', kind: 'soldier', count: 5 },
]

export interface DarkChessPiece {
  readonly id: string
  readonly color: DarkChessColor
  readonly kind: DarkChessPieceKind
  readonly revealed: boolean
}

export interface DarkChessPlayerColors {
  readonly player1: DarkChessColor | null
  readonly player2: DarkChessColor | null
}

export type DarkChessDrawReason = 'automatic-50-steps' | 'agreement'

export interface DarkChessDrawOffer {
  readonly from: DarkChessPlayer
}

export interface DarkChessFlipRecord {
  readonly kind: 'flip'
  readonly player: DarkChessPlayer
  readonly cell: number
}

export interface DarkChessMoveRecord {
  readonly kind: 'move'
  readonly player: DarkChessPlayer
  readonly from: number
  readonly to: number
}

export interface DarkChessCaptureRecord {
  readonly kind: 'capture'
  readonly player: DarkChessPlayer
  readonly from: number
  readonly to: number
}

export interface DarkChessDrawOfferRecord {
  readonly kind: 'draw-offer'
  readonly player: DarkChessPlayer
}

export interface DarkChessDrawResponseRecord {
  readonly kind: 'draw-response'
  readonly player: DarkChessPlayer
  readonly response: DarkChessDrawResponse
}

export type DarkChessTurnRecord =
  | DarkChessFlipRecord
  | DarkChessMoveRecord
  | DarkChessCaptureRecord
  | DarkChessDrawOfferRecord
  | DarkChessDrawResponseRecord

export type DarkChessDrawResponse = 'accept' | 'reject'

export type DarkChessAction =
  | { readonly kind: 'flip'; readonly cell: number }
  | { readonly kind: 'move'; readonly from: number; readonly to: number }
  | { readonly kind: 'capture'; readonly from: number; readonly to: number }
  | { readonly kind: 'draw-offer' }
  | { readonly kind: 'draw-response'; readonly response: DarkChessDrawResponse }

export interface DarkChessState {
  readonly version: 1
  readonly boardWidth: 4
  readonly boardHeight: 8
  readonly startingPlayer: 'player1'
  readonly seed: number
  readonly board: readonly DarkChessCell[]
  readonly pieces: readonly DarkChessPiece[]
  readonly currentPlayer: DarkChessPlayer
  readonly playerColors: DarkChessPlayerColors
  readonly phase: TurnGamePhase
  readonly winner: DarkChessPlayer | null
  readonly drawReason: DarkChessDrawReason | null
  readonly quietStreak: number
  readonly turns: readonly DarkChessTurnRecord[]
  readonly drawOffer: DarkChessDrawOffer | null
}

export interface DarkChessGameResult {
  readonly phase: TurnGamePhase
  readonly winner: DarkChessPlayer | null
  readonly drawReason: DarkChessDrawReason | null
  readonly quietStreak: number
}

export interface DarkChessPublicPiece {
  readonly revealed: boolean
  readonly color: DarkChessColor | null
  readonly kind: DarkChessPieceKind | null
}

export interface DarkChessPublicState {
  readonly version: 1
  readonly boardWidth: 4
  readonly boardHeight: 8
  readonly board: readonly (DarkChessPublicPiece | null)[]
  readonly currentPlayer: DarkChessPlayer
  readonly playerColors: DarkChessPlayerColors
  readonly phase: TurnGamePhase
  readonly winner: DarkChessPlayer | null
  readonly drawReason: DarkChessDrawReason | null
  readonly quietStreak: number
  readonly drawOffer: DarkChessDrawOffer | null
}

function otherPlayer(player: DarkChessPlayer): DarkChessPlayer {
  return player === 'player1' ? 'player2' : 'player1'
}

function isPlayer(value: unknown): value is DarkChessPlayer {
  return value === 'player1' || value === 'player2'
}

function isColor(value: unknown): value is DarkChessColor {
  return value === 'red' || value === 'black'
}

function isPieceKind(value: unknown): value is DarkChessPieceKind {
  return value === 'general' || value === 'advisor' || value === 'elephant' || value === 'chariot' ||
    value === 'horse' || value === 'cannon' || value === 'soldier'
}

function isDrawReason(value: unknown): value is DarkChessDrawReason {
  return value === 'automatic-50-steps' || value === 'agreement'
}

function isCell(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DARK_CHESS_BOARD_CELLS
}

function isDrawResponse(value: unknown): value is DarkChessDrawResponse {
  return value === 'accept' || value === 'reject'
}

function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0
  return normalized === 0 ? DARK_CHESS_DEFAULT_SEED : normalized
}

function nextRandom(seed: number): readonly [number, number] {
  let value = seed >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  const nextSeed = value >>> 0
  return [nextSeed, nextSeed / 0x100000000]
}

function shuffle<T>(items: readonly T[], seed: number): readonly T[] {
  const result = [...items]
  let randomSeed = normalizeSeed(seed)
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = nextRandom(randomSeed)
    randomSeed = next[0]
    const swapIndex = Math.floor(next[1] * (index + 1))
    const current = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = current
  }
  return result
}

function createPieces(): readonly DarkChessPiece[] {
  return PIECE_COUNTS.flatMap(({ color, kind, count }) => Array.from({ length: count }, (_, index) => ({
    id: `${color}-${kind}-${index + 1}`,
    color,
    kind,
    revealed: false,
  })))
}

function inBounds(row: number, column: number): boolean {
  return row >= 0 && row < DARK_CHESS_BOARD_HEIGHT && column >= 0 && column < DARK_CHESS_BOARD_WIDTH
}

function toRowColumn(cell: number): readonly [number, number] {
  return [Math.floor(cell / DARK_CHESS_BOARD_WIDTH), cell % DARK_CHESS_BOARD_WIDTH]
}

function toCell(row: number, column: number): number {
  return row * DARK_CHESS_BOARD_WIDTH + column
}

function pieceAt(state: Pick<DarkChessState, 'board' | 'pieces'>, cell: number): DarkChessPiece | null {
  const id = state.board[cell]
  return id === null ? null : state.pieces.find((piece) => piece.id === id) ?? null
}

function pieceById(pieces: readonly DarkChessPiece[], id: string): DarkChessPiece | null {
  return pieces.find((piece) => piece.id === id) ?? null
}

function playerColor(state: DarkChessState, player: DarkChessPlayer): DarkChessColor | null {
  return state.playerColors[player]
}

function cellHasHiddenPiece(state: DarkChessState, cell: number): boolean {
  const piece = pieceAt(state, cell)
  return piece !== null && !piece.revealed
}

function isOwnedRevealedPiece(state: DarkChessState, cell: number, player: DarkChessPlayer): boolean {
  const color = playerColor(state, player)
  const piece = pieceAt(state, cell)
  return color !== null && piece !== null && piece.revealed && piece.color === color
}

function isEnemyRevealedPiece(state: DarkChessState, cell: number, player: DarkChessPlayer): boolean {
  const color = playerColor(state, player)
  const piece = pieceAt(state, cell)
  return color !== null && piece !== null && piece.revealed && piece.color !== color
}

function canOrdinaryCapture(attacker: DarkChessPiece, target: DarkChessPiece): boolean {
  if (attacker.kind === 'cannon') return false
  // 兵／卒是將／帥的剋星，但不是「任何棋子都不能吃」的免疫棋：
  // 兵卒彼此可以互吃，階級高於兵卒的棋子也可以吃兵卒；只有將／帥
  // 不能反過來吃兵／卒。其餘棋子依同階或大吃小判定。
  if (attacker.kind === 'soldier') return target.kind === 'soldier' || target.kind === 'general'
  if (target.kind === 'soldier') return attacker.kind !== 'general'
  return PIECE_RANK[attacker.kind] >= PIECE_RANK[target.kind]
}

function canPublicOrdinaryCapture(attacker: DarkChessPublicPiece, target: DarkChessPublicPiece): boolean {
  if (!attacker.revealed || !target.revealed || attacker.kind === null || target.kind === null) return false
  if (attacker.kind === 'cannon') return false
  if (attacker.kind === 'soldier') return target.kind === 'soldier' || target.kind === 'general'
  if (target.kind === 'soldier') return attacker.kind !== 'general'
  return PIECE_RANK[attacker.kind] >= PIECE_RANK[target.kind]
}

function isAdjacent(from: number, to: number): boolean {
  const [fromRow, fromColumn] = toRowColumn(from)
  const [toRow, toColumn] = toRowColumn(to)
  return Math.abs(fromRow - toRow) + Math.abs(fromColumn - toColumn) === 1
}

function isCannonCapture(state: DarkChessState, from: number, to: number, player: DarkChessPlayer): boolean {
  const attacker = pieceAt(state, from)
  const target = pieceAt(state, to)
  if (attacker?.kind !== 'cannon' || target === null || !target.revealed || !isEnemyRevealedPiece(state, to, player)) return false

  const [fromRow, fromColumn] = toRowColumn(from)
  const [toRow, toColumn] = toRowColumn(to)
  const rowStep = Math.sign(toRow - fromRow)
  const columnStep = Math.sign(toColumn - fromColumn)
  if (rowStep !== 0 && columnStep !== 0) return false
  if (rowStep === 0 && columnStep === 0) return false

  let row = fromRow + rowStep
  let column = fromColumn + columnStep
  let occupiedCount = 0
  while (inBounds(row, column)) {
    const cell = toCell(row, column)
    if (cell === to) return occupiedCount === 1
    if (state.board[cell] !== null) {
      occupiedCount += 1
      if (occupiedCount > 1) return false
    }
    row += rowStep
    column += columnStep
  }
  return false
}

function isLegalMoveAction(state: DarkChessState, from: number, to: number, player: DarkChessPlayer): boolean {
  return isCell(from) && isCell(to) && isOwnedRevealedPiece(state, from, player) && state.board[to] === null && isAdjacent(from, to)
}

function isLegalCaptureAction(state: DarkChessState, from: number, to: number, player: DarkChessPlayer): boolean {
  if (!isCell(from) || !isCell(to) || !isOwnedRevealedPiece(state, from, player) || !isEnemyRevealedPiece(state, to, player)) return false
  const attacker = pieceAt(state, from)
  const target = pieceAt(state, to)
  if (attacker === null || target === null) return false
  if (attacker.kind === 'cannon') return isCannonCapture(state, from, to, player)
  return isAdjacent(from, to) && canOrdinaryCapture(attacker, target)
}

function sameAction(left: DarkChessAction, right: DarkChessAction): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'flip' && right.kind === 'flip') return left.cell === right.cell
  if (left.kind === 'draw-offer' && right.kind === 'draw-offer') return true
  if (left.kind === 'draw-response' && right.kind === 'draw-response') return left.response === right.response
  if (left.kind === 'move' && right.kind === 'move') return left.from === right.from && left.to === right.to
  return left.kind === 'capture' && right.kind === 'capture' && left.from === right.from && left.to === right.to
}

function actionToRecord(action: DarkChessAction, player: DarkChessPlayer): DarkChessTurnRecord {
  if (action.kind === 'flip') return { kind: 'flip', player, cell: action.cell }
  if (action.kind === 'move') return { kind: 'move', player, from: action.from, to: action.to }
  if (action.kind === 'capture') return { kind: 'capture', player, from: action.from, to: action.to }
  if (action.kind === 'draw-offer') return { kind: 'draw-offer', player }
  return { kind: 'draw-response', player, response: action.response }
}

function noPiecesOfColor(state: DarkChessState, color: DarkChessColor): boolean {
  return state.board.every((id) => id === null || pieceById(state.pieces, id)?.color !== color)
}

function withTerminalResult(state: DarkChessState, actor: DarkChessPlayer): DarkChessState {
  const actorColor = playerColor(state, actor)
  const opponent = otherPlayer(actor)
  const opponentColor = playerColor(state, opponent)
  if (actorColor !== null && opponentColor !== null && noPiecesOfColor(state, opponentColor)) {
    return { ...state, phase: 'won', winner: actor, drawReason: null }
  }

  const opponentActions = getLegalDarkChessActionsForPlayer(state, opponent)
  if (actorColor !== null && opponentActions.length === 0) {
    return { ...state, phase: 'won', winner: actor, drawReason: null }
  }

  if (state.quietStreak >= DARK_CHESS_AUTO_DRAW_STEPS) {
    return { ...state, phase: 'draw', winner: null, drawReason: 'automatic-50-steps' }
  }
  return { ...state, phase: 'playing', winner: null, drawReason: null }
}

function updatePieceReveal(pieces: readonly DarkChessPiece[], id: string): readonly DarkChessPiece[] {
  return pieces.map((piece) => piece.id === id ? { ...piece, revealed: true } : piece)
}

export function createDarkChessState(seed = DARK_CHESS_DEFAULT_SEED): DarkChessState {
  const pieces = createPieces()
  const shuffledIds = shuffle(pieces.map((piece) => piece.id), seed)
  return {
    version: 1,
    boardWidth: DARK_CHESS_BOARD_WIDTH,
    boardHeight: DARK_CHESS_BOARD_HEIGHT,
    startingPlayer: 'player1',
    seed: normalizeSeed(seed),
    board: shuffledIds,
    pieces,
    currentPlayer: 'player1',
    playerColors: { player1: null, player2: null },
    phase: 'playing',
    winner: null,
    drawReason: null,
    quietStreak: 0,
    turns: [],
    drawOffer: null,
  }
}

export function getPieceAt(state: DarkChessState, cell: number): DarkChessPiece | null {
  return isCell(cell) ? pieceAt(state, cell) : null
}

export function getLegalDarkChessActionsForPlayer(state: DarkChessState, player: DarkChessPlayer): readonly DarkChessAction[] {
  if (state.phase !== 'playing' || state.drawOffer !== null) return []

  const actions: DarkChessAction[] = []
  for (let cell = 0; cell < DARK_CHESS_BOARD_CELLS; cell += 1) {
    if (cellHasHiddenPiece(state, cell)) actions.push({ kind: 'flip', cell })
  }

  if (playerColor(state, player) === null) return actions

  for (let from = 0; from < DARK_CHESS_BOARD_CELLS; from += 1) {
    if (!isOwnedRevealedPiece(state, from, player)) continue
    const [row, column] = toRowColumn(from)
    const piece = pieceAt(state, from)
    if (piece === null) continue

    for (const [rowStep, columnStep] of ORTHOGONAL_DIRECTIONS) {
      const nextRow = row + rowStep
      const nextColumn = column + columnStep
      if (!inBounds(nextRow, nextColumn)) continue
      const to = toCell(nextRow, nextColumn)
      if (state.board[to] === null) {
        actions.push({ kind: 'move', from, to })
      } else if (piece.kind !== 'cannon' && isLegalCaptureAction(state, from, to, player)) {
        actions.push({ kind: 'capture', from, to })
      }
    }

    if (piece.kind === 'cannon') {
      for (const [rowStep, columnStep] of ORTHOGONAL_DIRECTIONS) {
        let nextRow = row + rowStep
        let nextColumn = column + columnStep
        let occupiedCount = 0
        while (inBounds(nextRow, nextColumn)) {
          const to = toCell(nextRow, nextColumn)
          if (state.board[to] !== null) {
            occupiedCount += 1
            if (occupiedCount === 2) {
              if (isLegalCaptureAction(state, from, to, player)) actions.push({ kind: 'capture', from, to })
              break
            }
          }
          nextRow += rowStep
          nextColumn += columnStep
        }
      }
    }
  }
  return actions
}

export function getLegalDarkChessActions(state: DarkChessState): readonly DarkChessAction[] {
  if (state.drawOffer !== null) return []
  return getLegalDarkChessActionsForPlayer(state, state.currentPlayer)
}

export function getGameResult(state: DarkChessState): DarkChessGameResult {
  return {
    phase: state.phase,
    winner: state.winner,
    drawReason: state.drawReason,
    quietStreak: state.quietStreak,
  }
}

export function getNpcDrawResponse(state: DarkChessState): DarkChessDrawResponse {
  if (state.drawOffer === null) throw new Error('目前沒有等待回應的和局提議。')
  return state.quietStreak >= DARK_CHESS_NPC_DRAW_ACCEPT_STEPS ? 'accept' : 'reject'
}

export function getPublicDarkChessState(state: DarkChessState): DarkChessPublicState {
  return {
    version: state.version,
    boardWidth: state.boardWidth,
    boardHeight: state.boardHeight,
    board: state.board.map((id) => {
      if (id === null) return null
      const piece = pieceById(state.pieces, id)
      if (piece === null || !piece.revealed) return { revealed: false, color: null, kind: null }
      return { revealed: true, color: piece.color, kind: piece.kind }
    }),
    currentPlayer: state.currentPlayer,
    playerColors: state.playerColors,
    phase: state.phase,
    winner: state.winner,
    drawReason: state.drawReason,
    quietStreak: state.quietStreak,
    drawOffer: state.drawOffer,
  }
}

function isPublicEnemyRevealedPiece(state: DarkChessPublicState, cell: number, player: DarkChessPlayer): boolean {
  const color = state.playerColors[player]
  const piece = state.board[cell]
  return color !== null && piece !== null && piece.revealed && piece.color !== null && piece.color !== color
}

function isPublicOwnedRevealedPiece(state: DarkChessPublicState, cell: number, player: DarkChessPlayer): boolean {
  const color = state.playerColors[player]
  const piece = state.board[cell]
  return color !== null && piece !== null && piece.revealed && piece.color === color
}

function isPublicCannonCapture(state: DarkChessPublicState, from: number, to: number, player: DarkChessPlayer): boolean {
  const attacker = state.board[from]
  const target = state.board[to]
  if (attacker?.kind !== 'cannon' || !target?.revealed || !isPublicEnemyRevealedPiece(state, to, player)) return false

  const [fromRow, fromColumn] = toRowColumn(from)
  const [toRow, toColumn] = toRowColumn(to)
  const rowStep = Math.sign(toRow - fromRow)
  const columnStep = Math.sign(toColumn - fromColumn)
  if (rowStep !== 0 && columnStep !== 0) return false
  if (rowStep === 0 && columnStep === 0) return false

  let row = fromRow + rowStep
  let column = fromColumn + columnStep
  let occupiedCount = 0
  while (inBounds(row, column)) {
    const cell = toCell(row, column)
    if (cell === to) return occupiedCount === 1
    if (state.board[cell] !== null) {
      occupiedCount += 1
      if (occupiedCount > 1) return false
    }
    row += rowStep
    column += columnStep
  }
  return false
}

/**
 * 只用已公開棋面產生行動。NPC 不應呼叫會讀取 hidden piece kind/color 的內部走法清單。
 * 暗棋格只提供「可以翻」，不提供尚未翻開棋子的種類、陣營或價值。
 */
export function getLegalPublicDarkChessActionsForPlayer(
  state: DarkChessPublicState,
  player: DarkChessPlayer,
): readonly DarkChessAction[] {
  if (state.phase !== 'playing' || state.drawOffer !== null) return []

  const actions: DarkChessAction[] = []
  for (let cell = 0; cell < DARK_CHESS_BOARD_CELLS; cell += 1) {
    const piece = state.board[cell]
    if (piece !== null && !piece.revealed) actions.push({ kind: 'flip', cell })
  }

  if (state.playerColors[player] === null) return actions

  for (let from = 0; from < DARK_CHESS_BOARD_CELLS; from += 1) {
    if (!isPublicOwnedRevealedPiece(state, from, player)) continue
    const piece = state.board[from]
    if (piece === null || piece.kind === null) continue
    const [row, column] = toRowColumn(from)

    for (const [rowStep, columnStep] of ORTHOGONAL_DIRECTIONS) {
      const nextRow = row + rowStep
      const nextColumn = column + columnStep
      if (!inBounds(nextRow, nextColumn)) continue
      const to = toCell(nextRow, nextColumn)
      const target = state.board[to]
      if (target === null) {
        actions.push({ kind: 'move', from, to })
      } else if (piece.kind !== 'cannon' && isPublicEnemyRevealedPiece(state, to, player) &&
        canPublicOrdinaryCapture(piece, target) &&
        isAdjacent(from, to)) {
        actions.push({ kind: 'capture', from, to })
      }
    }

    if (piece.kind === 'cannon') {
      for (const [rowStep, columnStep] of ORTHOGONAL_DIRECTIONS) {
        let nextRow = row + rowStep
        let nextColumn = column + columnStep
        let occupiedCount = 0
        while (inBounds(nextRow, nextColumn)) {
          const to = toCell(nextRow, nextColumn)
          if (state.board[to] !== null) {
            occupiedCount += 1
            if (occupiedCount === 2) {
              if (isPublicCannonCapture(state, from, to, player)) actions.push({ kind: 'capture', from, to })
              break
            }
          }
          nextRow += rowStep
          nextColumn += columnStep
        }
      }
    }
  }
  return actions
}

export function getLegalPublicDarkChessActions(state: DarkChessPublicState): readonly DarkChessAction[] {
  return getLegalPublicDarkChessActionsForPlayer(state, state.currentPlayer)
}

export function applyDarkChessAction(state: DarkChessState, action: DarkChessAction): DarkChessState {
  if (state.phase !== 'playing') throw new Error('暗棋對局已經結束，不能繼續操作。')

  if (action.kind === 'draw-offer') {
    if (state.drawOffer !== null) throw new Error('目前已經有一個等待回應的和局提議。')
    return {
      ...state,
      currentPlayer: otherPlayer(state.currentPlayer),
      turns: [...state.turns, actionToRecord(action, state.currentPlayer)],
      drawOffer: { from: state.currentPlayer },
    }
  }

  if (action.kind === 'draw-response') {
    if (state.drawOffer === null) throw new Error('目前沒有等待回應的和局提議。')
    if (state.drawOffer.from === state.currentPlayer) throw new Error('提議和局後，必須等待另一位玩家回應。')
    const record = actionToRecord(action, state.currentPlayer)
    if (action.response === 'accept') {
      return {
        ...state,
        phase: 'draw',
        winner: null,
        drawReason: 'agreement',
        turns: [...state.turns, record],
        drawOffer: null,
      }
    }
    return { ...state, currentPlayer: state.drawOffer.from, turns: [...state.turns, record], drawOffer: null }
  }

  if (state.drawOffer !== null) throw new Error('請先回應目前的和局提議。')
  const legalActions = getLegalDarkChessActions(state)
  if (!legalActions.some((candidate) => sameAction(candidate, action))) throw new Error('這不是目前可以執行的暗棋行動。')

  const actor = state.currentPlayer
  let board = [...state.board]
  let pieces = state.pieces
  let playerColors = state.playerColors
  let quietStreak = state.quietStreak

  if (action.kind === 'flip') {
    const id = board[action.cell]
    if (id === null) throw new Error('這一格沒有暗棋可以翻開。')
    const piece = pieceById(pieces, id)
    if (piece === null || piece.revealed) throw new Error('這一格已經是明棋。')
    pieces = updatePieceReveal(pieces, id)
    if (playerColors.player1 === null) {
      playerColors = piece.color === 'red'
        ? { player1: 'red', player2: 'black' }
        : { player1: 'black', player2: 'red' }
    }
    quietStreak = 0
  } else {
    if (action.kind === 'move') {
      if (!isLegalMoveAction(state, action.from, action.to, actor)) throw new Error('這一步不能移動。')
    } else if (!isLegalCaptureAction(state, action.from, action.to, actor)) {
      throw new Error('這一步不能吃子。')
    }
    const movingId = board[action.from]
    if (movingId === null) throw new Error('起點沒有棋子。')
    board[action.from] = null
    board[action.to] = movingId
    quietStreak = action.kind === 'move' ? state.quietStreak + 1 : 0
  }

  const next: DarkChessState = {
    ...state,
    board,
    pieces,
    playerColors,
    currentPlayer: otherPlayer(actor),
    quietStreak,
    turns: [...state.turns, actionToRecord(action, actor)],
    drawOffer: null,
  }
  return withTerminalResult(next, actor)
}

export function replayDarkChessTurns(seed: number, turns: readonly DarkChessTurnRecord[]): DarkChessState {
  return turns.reduce((state, record) => {
    if (record.kind === 'flip') return applyDarkChessAction(state, { kind: 'flip', cell: record.cell })
    if (record.kind === 'move') return applyDarkChessAction(state, { kind: 'move', from: record.from, to: record.to })
    if (record.kind === 'capture') return applyDarkChessAction(state, { kind: 'capture', from: record.from, to: record.to })
    if (record.kind === 'draw-offer') return applyDarkChessAction(state, { kind: 'draw-offer' })
    return applyDarkChessAction(state, { kind: 'draw-response', response: record.response })
  }, createDarkChessState(seed))
}

function isTurnRecord(value: unknown): value is DarkChessTurnRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (!isPlayer(record.player)) return false
  if (record.kind === 'flip') return isCell(record.cell)
  if (record.kind === 'move' || record.kind === 'capture') return isCell(record.from) && isCell(record.to)
  if (record.kind === 'draw-offer') return true
  return record.kind === 'draw-response' && isDrawResponse(record.response)
}

function sameTurns(left: readonly DarkChessTurnRecord[], right: readonly DarkChessTurnRecord[]): boolean {
  return left.length === right.length && left.every((record, index) => {
    const candidate = right[index]
    if (candidate === undefined || record.kind !== candidate.kind || record.player !== candidate.player) return false
    if (record.kind === 'flip' && candidate.kind === 'flip') return record.cell === candidate.cell
    if ((record.kind === 'move' && candidate.kind === 'move') || (record.kind === 'capture' && candidate.kind === 'capture')) {
      return record.from === candidate.from && record.to === candidate.to
    }
    if (record.kind === 'draw-response' && candidate.kind === 'draw-response') return record.response === candidate.response
    return true
  })
}

function samePieces(left: readonly DarkChessPiece[], right: unknown): boolean {
  return Array.isArray(right) && right.length === left.length && right.every((candidate, index) => {
    const piece = left[index]
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate) || piece === undefined) return false
    const value = candidate as Record<string, unknown>
    return value.id === piece.id && value.color === piece.color && isPieceKind(value.kind) && value.kind === piece.kind && value.revealed === piece.revealed
  })
}

function samePlayerColors(left: DarkChessPlayerColors, right: unknown): boolean {
  if (typeof right !== 'object' || right === null || Array.isArray(right)) return false
  const value = right as Record<string, unknown>
  return (value.player1 === null || isColor(value.player1)) && (value.player2 === null || isColor(value.player2)) &&
    value.player1 === left.player1 && value.player2 === left.player2
}

function sameBoard(left: readonly DarkChessCell[], right: unknown): boolean {
  return Array.isArray(right) && right.length === DARK_CHESS_BOARD_CELLS && right.every((cell, index) => cell === left[index])
}

function sameDrawOffer(left: DarkChessDrawOffer | null, right: unknown): boolean {
  if (left === null) return right === null
  if (typeof right !== 'object' || right === null || Array.isArray(right)) return false
  return (right as Record<string, unknown>).from === left.from
}

export function serializeDarkChessState(state: DarkChessState): string {
  return JSON.stringify(state)
}

export function deserializeDarkChessState(serialized: string): DarkChessState {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('暗棋存檔不是有效的 JSON。')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('暗棋存檔格式不正確。')
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || candidate.boardWidth !== DARK_CHESS_BOARD_WIDTH || candidate.boardHeight !== DARK_CHESS_BOARD_HEIGHT ||
    candidate.startingPlayer !== 'player1' || typeof candidate.seed !== 'number' || !Number.isInteger(candidate.seed) ||
    !Array.isArray(candidate.turns) || !candidate.turns.every(isTurnRecord)) {
    throw new Error('暗棋存檔版本、棋盤尺寸、亂數種子或回合紀錄不正確。')
  }

  let replayed: DarkChessState
  try {
    replayed = replayDarkChessTurns(candidate.seed, candidate.turns)
  } catch {
    throw new Error('暗棋回合紀錄包含不合法步驟。')
  }

  const valid = candidate.seed === replayed.seed && sameTurns(replayed.turns, candidate.turns) && sameBoard(replayed.board, candidate.board) && samePieces(replayed.pieces, candidate.pieces) &&
    candidate.currentPlayer === replayed.currentPlayer && samePlayerColors(replayed.playerColors, candidate.playerColors) &&
    candidate.phase === replayed.phase && candidate.winner === replayed.winner && (candidate.drawReason === null || isDrawReason(candidate.drawReason)) && candidate.drawReason === replayed.drawReason &&
    candidate.quietStreak === replayed.quietStreak && sameDrawOffer(replayed.drawOffer, candidate.drawOffer)
  if (!valid) throw new Error('暗棋存檔局面、隱藏棋子、回合、計數或結果與規則重播不一致。')
  return replayed
}

export const darkChessRules: TurnGameRules<DarkChessState, DarkChessAction> = {
  createInitialState: createDarkChessState,
  getLegalMoves: getLegalDarkChessActions,
  applyMove: applyDarkChessAction,
  serialize: serializeDarkChessState,
  deserialize: deserializeDarkChessState,
}
