import type { TurnGamePhase } from '../core/turn-game'

export type AnimalPlayer = 'player1' | 'player2'
export type AnimalKind = 'elephant' | 'lion' | 'tiger' | 'leopard' | 'wolf' | 'dog' | 'cat' | 'mouse'
export type AnimalCell = string | null
export type AnimalDrawReason = 'quiet-50-rounds' | 'threefold'
export type AnimalChessDifficulty = 'beginner' | 'growth' | 'challenge' | 'adult'
export type AnimalChessSetup = 'tutorial-1' | 'tutorial-1-check' | 'tutorial-2' | 'tutorial-2-check' | 'tutorial-3' | 'tutorial-3-check' | 'tutorial-4' | 'tutorial-4-check' | 'tutorial-5' | 'tutorial-5-blocked' | 'tutorial-6' | 'tutorial-6-den'

export const ANIMAL_CHESS_BOARD_WIDTH = 7
export const ANIMAL_CHESS_BOARD_HEIGHT = 9
export const ANIMAL_CHESS_BOARD_CELLS = ANIMAL_CHESS_BOARD_WIDTH * ANIMAL_CHESS_BOARD_HEIGHT
export const ANIMAL_CHESS_QUIET_ROUNDS = 50
export const ANIMAL_CHESS_DEFAULT_SEED = 0x6a27c401

const ORTHOGONAL_DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

const ANIMAL_RANK: Readonly<Record<AnimalKind, number>> = {
  mouse: 1,
  cat: 2,
  dog: 3,
  wolf: 4,
  leopard: 5,
  tiger: 6,
  lion: 7,
  elephant: 8,
}

const INITIAL_PLACEMENTS: readonly { readonly owner: AnimalPlayer; readonly kind: AnimalKind; readonly row: number; readonly column: number }[] = [
  // 第一位玩家固定在棋盤下方先手；第二位玩家固定在棋盤上方後手。
  { owner: 'player2', kind: 'lion', row: 0, column: 0 },
  { owner: 'player2', kind: 'tiger', row: 0, column: 6 },
  { owner: 'player2', kind: 'dog', row: 1, column: 1 },
  { owner: 'player2', kind: 'cat', row: 1, column: 5 },
  { owner: 'player2', kind: 'elephant', row: 2, column: 0 },
  { owner: 'player2', kind: 'leopard', row: 2, column: 2 },
  { owner: 'player2', kind: 'wolf', row: 2, column: 4 },
  { owner: 'player2', kind: 'mouse', row: 2, column: 6 },
  { owner: 'player1', kind: 'lion', row: 8, column: 6 },
  { owner: 'player1', kind: 'tiger', row: 8, column: 0 },
  { owner: 'player1', kind: 'dog', row: 7, column: 5 },
  { owner: 'player1', kind: 'cat', row: 7, column: 1 },
  { owner: 'player1', kind: 'elephant', row: 6, column: 6 },
  { owner: 'player1', kind: 'leopard', row: 6, column: 4 },
  { owner: 'player1', kind: 'wolf', row: 6, column: 2 },
  { owner: 'player1', kind: 'mouse', row: 6, column: 0 },
]

export interface AnimalPiece {
  readonly id: string
  readonly owner: AnimalPlayer
  readonly kind: AnimalKind
  readonly row: number
  readonly column: number
  readonly captured: boolean
}

export interface AnimalMove {
  readonly from: number
  readonly to: number
}

export interface AnimalMoveRecord extends AnimalMove {
  readonly player: AnimalPlayer
  readonly capturedId: string | null
}

export interface AnimalChessState {
  readonly version: 1
  readonly boardWidth: 7
  readonly boardHeight: 9
  readonly seed: number
  readonly board: readonly AnimalCell[]
  readonly pieces: readonly AnimalPiece[]
  readonly currentPlayer: AnimalPlayer
  readonly phase: TurnGamePhase
  readonly winner: AnimalPlayer | null
  readonly drawReason: AnimalDrawReason | null
  readonly quietRounds: number
  readonly positionHistory: readonly string[]
  readonly turns: readonly AnimalMoveRecord[]
  readonly setup?: AnimalChessSetup
}

function otherPlayer(player: AnimalPlayer): AnimalPlayer {
  return player === 'player1' ? 'player2' : 'player1'
}

function isPlayer(value: unknown): value is AnimalPlayer {
  return value === 'player1' || value === 'player2'
}

function isAnimalKind(value: unknown): value is AnimalKind {
  return value === 'elephant' || value === 'lion' || value === 'tiger' || value === 'leopard' ||
    value === 'wolf' || value === 'dog' || value === 'cat' || value === 'mouse'
}

function isCell(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < ANIMAL_CHESS_BOARD_CELLS
}

function toCell(row: number, column: number): number {
  return row * ANIMAL_CHESS_BOARD_WIDTH + column
}

function toRowColumn(cell: number): readonly [number, number] {
  return [Math.floor(cell / ANIMAL_CHESS_BOARD_WIDTH), cell % ANIMAL_CHESS_BOARD_WIDTH]
}

function inBounds(row: number, column: number): boolean {
  return row >= 0 && row < ANIMAL_CHESS_BOARD_HEIGHT && column >= 0 && column < ANIMAL_CHESS_BOARD_WIDTH
}

export function isAnimalRiverCell(cell: number): boolean {
  const [row, column] = toRowColumn(cell)
  return row >= 3 && row <= 5 && (column === 1 || column === 2 || column === 4 || column === 5)
}

export function getAnimalDenOwner(cell: number): AnimalPlayer | null {
  if (cell === toCell(0, 3)) return 'player2'
  if (cell === toCell(8, 3)) return 'player1'
  return null
}

export function getAnimalTrapOwner(cell: number): AnimalPlayer | null {
  const [row, column] = toRowColumn(cell)
  if (row === 1 && column >= 2 && column <= 4) return 'player2'
  if (row === 7 && column >= 2 && column <= 4) return 'player1'
  return null
}

function createInitialPieces(): readonly AnimalPiece[] {
  return INITIAL_PLACEMENTS.map(({ owner, kind, row, column }, index) => ({
    id: `${owner}-${kind}-${index + 1}`,
    owner,
    kind,
    row,
    column,
    captured: false,
  }))
}

interface TutorialPlacement {
  readonly owner: AnimalPlayer
  readonly kind: AnimalKind
  readonly row: number
  readonly column: number
}

const TUTORIAL_PLACEMENTS: Readonly<Record<AnimalChessSetup, readonly TutorialPlacement[]>> = {
  'tutorial-1': [
    { owner: 'player1', kind: 'lion', row: 4, column: 3 },
    { owner: 'player2', kind: 'elephant', row: 6, column: 6 },
  ],
  'tutorial-1-check': [
    { owner: 'player1', kind: 'lion', row: 3, column: 3 },
    { owner: 'player2', kind: 'elephant', row: 6, column: 6 },
  ],
  'tutorial-2': [
    { owner: 'player1', kind: 'lion', row: 4, column: 3 },
    { owner: 'player2', kind: 'dog', row: 3, column: 3 },
    { owner: 'player2', kind: 'elephant', row: 6, column: 6 },
  ],
  'tutorial-2-check': [
    { owner: 'player1', kind: 'lion', row: 3, column: 3 },
    { owner: 'player2', kind: 'elephant', row: 6, column: 6 },
  ],
  'tutorial-3': [
    { owner: 'player1', kind: 'mouse', row: 4, column: 3 },
    { owner: 'player2', kind: 'elephant', row: 4, column: 4 },
    { owner: 'player2', kind: 'dog', row: 6, column: 6 },
  ],
  'tutorial-3-check': [
    { owner: 'player1', kind: 'mouse', row: 4, column: 4 },
    { owner: 'player2', kind: 'dog', row: 6, column: 6 },
  ],
  'tutorial-4': [
    { owner: 'player1', kind: 'mouse', row: 2, column: 1 },
    { owner: 'player2', kind: 'dog', row: 6, column: 6 },
  ],
  'tutorial-4-check': [
    { owner: 'player1', kind: 'mouse', row: 3, column: 1 },
    { owner: 'player2', kind: 'dog', row: 6, column: 6 },
  ],
  'tutorial-5': [
    { owner: 'player1', kind: 'lion', row: 2, column: 4 },
    { owner: 'player2', kind: 'dog', row: 6, column: 6 },
  ],
  'tutorial-5-blocked': [
    { owner: 'player1', kind: 'lion', row: 6, column: 4 },
    { owner: 'player2', kind: 'mouse', row: 4, column: 4 },
    { owner: 'player2', kind: 'dog', row: 6, column: 6 },
  ],
  'tutorial-6': [
    // 第六關沿用標準方向：第一位玩家在下方陷阱吃子，第二位玩家再由上方反攻獸穴。
    { owner: 'player1', kind: 'cat', row: 7, column: 2 },
    { owner: 'player2', kind: 'elephant', row: 7, column: 3 },
    { owner: 'player2', kind: 'dog', row: 8, column: 4 },
  ],
  'tutorial-6-den': [
    { owner: 'player1', kind: 'cat', row: 7, column: 3 },
    { owner: 'player2', kind: 'dog', row: 8, column: 4 },
  ],
}

function scenarioPieces(placements: readonly TutorialPlacement[]): readonly AnimalPiece[] {
  const byKey = new Map(placements.map((placement) => [`${placement.owner}:${placement.kind}`, placement]))
  return createInitialPieces().map((piece) => {
    const placement = byKey.get(`${piece.owner}:${piece.kind}`)
    return placement === undefined
      ? { ...piece, captured: true, row: -1, column: -1 }
      : { ...piece, captured: false, row: placement.row, column: placement.column }
  })
}

function tutorialSetupCurrentPlayer(setup: AnimalChessSetup): AnimalPlayer {
  return setup === 'tutorial-6-den' ? 'player2' : 'player1'
}

function createStateFromPieces(pieces: readonly AnimalPiece[], setup: AnimalChessSetup, seed = ANIMAL_CHESS_DEFAULT_SEED, currentPlayer = tutorialSetupCurrentPlayer(setup)): AnimalChessState {
  const board = boardFromPieces(pieces)
  return {
    version: 1,
    boardWidth: ANIMAL_CHESS_BOARD_WIDTH,
    boardHeight: ANIMAL_CHESS_BOARD_HEIGHT,
    seed: seed >>> 0,
    board,
    pieces,
    currentPlayer,
    phase: 'playing',
    winner: null,
    drawReason: null,
    quietRounds: 0,
    positionHistory: [positionSignature(board, 'player1')],
    turns: [],
    setup,
  }
}

function boardFromPieces(pieces: readonly AnimalPiece[]): readonly AnimalCell[] {
  const board: AnimalCell[] = Array.from({ length: ANIMAL_CHESS_BOARD_CELLS }, () => null)
  for (const piece of pieces) {
    if (!piece.captured && inBounds(piece.row, piece.column)) board[toCell(piece.row, piece.column)] = piece.id
  }
  return board
}

function positionSignature(board: readonly AnimalCell[], currentPlayer: AnimalPlayer): string {
  return `${currentPlayer}:${board.map((id) => id ?? '_').join(',')}`
}

function countOccurrences(values: readonly string[], target: string): number {
  return values.reduce((count, value) => count + (value === target ? 1 : 0), 0)
}

export function getAnimalPieceAt(state: Pick<AnimalChessState, 'board' | 'pieces'>, cell: number): AnimalPiece | null {
  const id = state.board[cell]
  return id === null ? null : state.pieces.find((piece) => piece.id === id) ?? null
}

function isCaptureLegal(moving: AnimalPiece, target: AnimalPiece, targetCell: number): boolean {
  if (moving.owner === target.owner) return false
  if (getAnimalTrapOwner(targetCell) === moving.owner) return true
  if (moving.kind === 'mouse' && target.kind === 'elephant') return true
  if (moving.kind === 'elephant' && target.kind === 'mouse') return false
  return ANIMAL_RANK[moving.kind] >= ANIMAL_RANK[target.kind]
}

function canLand(state: AnimalChessState, moving: AnimalPiece, targetCell: number): boolean {
  const targetOwner = getAnimalDenOwner(targetCell)
  if (targetOwner === moving.owner) return false
  if (isAnimalRiverCell(targetCell) && moving.kind !== 'mouse') return false
  const target = getAnimalPieceAt(state, targetCell)
  return target === null || isCaptureLegal(moving, target, targetCell)
}

function addStepMoves(state: AnimalChessState, piece: AnimalPiece, moves: AnimalMove[]): void {
  for (const [rowDelta, columnDelta] of ORTHOGONAL_DIRECTIONS) {
    const row = piece.row + rowDelta
    const column = piece.column + columnDelta
    if (!inBounds(row, column)) continue
    const targetCell = toCell(row, column)
    if (canLand(state, piece, targetCell)) moves.push({ from: toCell(piece.row, piece.column), to: targetCell })
  }
}

function addRiverJumpMoves(state: AnimalChessState, piece: AnimalPiece, moves: AnimalMove[]): void {
  if (piece.kind !== 'lion' && piece.kind !== 'tiger') return

  for (const [rowDelta, columnDelta] of ORTHOGONAL_DIRECTIONS) {
    let row = piece.row + rowDelta
    let column = piece.column + columnDelta
    if (!inBounds(row, column) || !isAnimalRiverCell(toCell(row, column))) continue

    let blockedByMouse = false
    while (inBounds(row, column) && isAnimalRiverCell(toCell(row, column))) {
      const riverPiece = getAnimalPieceAt(state, toCell(row, column))
      if (riverPiece?.kind === 'mouse') blockedByMouse = true
      row += rowDelta
      column += columnDelta
    }

    if (!blockedByMouse && inBounds(row, column)) {
      const targetCell = toCell(row, column)
      if (canLand(state, piece, targetCell)) moves.push({ from: toCell(piece.row, piece.column), to: targetCell })
    }
  }
}

export function getLegalAnimalChessMoves(state: AnimalChessState, player = state.currentPlayer): readonly AnimalMove[] {
  if (state.phase !== 'playing') return []
  const moves: AnimalMove[] = []
  for (const piece of state.pieces) {
    if (piece.captured || piece.owner !== player) continue
    addStepMoves(state, piece, moves)
    addRiverJumpMoves(state, piece, moves)
  }
  return moves
}

export function createAnimalChessState(seed = ANIMAL_CHESS_DEFAULT_SEED): AnimalChessState {
  const pieces = createInitialPieces()
  const board = boardFromPieces(pieces)
  return {
    version: 1,
    boardWidth: ANIMAL_CHESS_BOARD_WIDTH,
    boardHeight: ANIMAL_CHESS_BOARD_HEIGHT,
    seed: seed >>> 0,
    board,
    pieces,
    currentPlayer: 'player1',
    phase: 'playing',
    winner: null,
    drawReason: null,
    quietRounds: 0,
    positionHistory: [positionSignature(board, 'player1')],
    turns: [],
  }
}

export function createAnimalChessTutorialState(step: 0 | 1 | 2 | 3 | 4 | 5, variant: 'check' | 'blocked-jump' | 'den' | undefined = undefined): AnimalChessState {
  const setup: AnimalChessSetup = step < 4 && variant === 'check'
    ? `tutorial-${step + 1}-check` as AnimalChessSetup
    : step === 4 && variant === 'blocked-jump'
    ? 'tutorial-5-blocked'
    : step === 5 && variant === 'den'
      ? 'tutorial-6-den'
      : `tutorial-${step + 1}` as AnimalChessSetup
  return createStateFromPieces(scenarioPieces(TUTORIAL_PLACEMENTS[setup]), setup)
}

function isAnimalChessSetup(value: unknown): value is AnimalChessSetup {
  return value === 'tutorial-1' || value === 'tutorial-1-check' || value === 'tutorial-2' || value === 'tutorial-2-check' ||
    value === 'tutorial-3' || value === 'tutorial-3-check' || value === 'tutorial-4' || value === 'tutorial-4-check' ||
    value === 'tutorial-5' || value === 'tutorial-5-blocked' || value === 'tutorial-6' || value === 'tutorial-6-den'
}

function isWinningMove(moving: AnimalPiece, targetCell: number, pieces: readonly AnimalPiece[]): boolean {
  const denOwner = getAnimalDenOwner(targetCell)
  if (denOwner === otherPlayer(moving.owner)) return true
  return pieces.filter((piece) => piece.owner === otherPlayer(moving.owner) && !piece.captured).length === 0
}

export function applyAnimalChessMove(state: AnimalChessState, move: AnimalMove): AnimalChessState {
  if (state.phase !== 'playing') throw new Error('這一局已經結束。')
  if (!isCell(move.from) || !isCell(move.to)) throw new Error('這一步不在棋盤裡。')
  const legalMove = getLegalAnimalChessMoves(state).find((candidate) => candidate.from === move.from && candidate.to === move.to)
  if (legalMove === undefined) throw new Error('這隻動物不能這樣走。')

  const moving = getAnimalPieceAt(state, move.from)
  if (moving === null) throw new Error('找不到要移動的動物。')
  const target = getAnimalPieceAt(state, move.to)
  const capturedId = target?.id ?? null
  const pieces = state.pieces.map((piece) => {
    if (piece.id === moving.id) return { ...piece, row: Math.floor(move.to / ANIMAL_CHESS_BOARD_WIDTH), column: move.to % ANIMAL_CHESS_BOARD_WIDTH }
    if (piece.id === capturedId) return { ...piece, captured: true, row: -1, column: -1 }
    return piece
  })
  const board = boardFromPieces(pieces)
  const currentPlayer = otherPlayer(state.currentPlayer)
  const positionHistory = [...state.positionHistory, positionSignature(board, currentPlayer)]
  const quietRounds = capturedId === null
    ? state.currentPlayer === 'player2' ? state.quietRounds + 1 : state.quietRounds
    : 0
  const winner = isWinningMove(moving, move.to, pieces) ? moving.owner : null
  const repeated = countOccurrences(positionHistory, positionHistory[positionHistory.length - 1]!) >= 3
  const phase: TurnGamePhase = winner !== null
    ? 'won'
    : quietRounds >= ANIMAL_CHESS_QUIET_ROUNDS || repeated
      ? 'draw'
      : 'playing'

  return {
    ...state,
    board,
    pieces,
    currentPlayer,
    phase,
    winner,
    drawReason: phase === 'draw' ? quietRounds >= ANIMAL_CHESS_QUIET_ROUNDS ? 'quiet-50-rounds' : 'threefold' : null,
    quietRounds,
    positionHistory,
    turns: [...state.turns, { ...move, player: state.currentPlayer, capturedId }],
  }
}

function isStateShape(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPhase(value: unknown): value is TurnGamePhase {
  return value === 'playing' || value === 'won' || value === 'draw'
}

function isDrawReason(value: unknown): value is AnimalDrawReason | null {
  return value === null || value === 'quiet-50-rounds' || value === 'threefold'
}

function validatePiece(value: unknown): value is AnimalPiece {
  if (!isStateShape(value)) return false
  return typeof value.id === 'string' && isPlayer(value.owner) && isAnimalKind(value.kind) &&
    typeof value.row === 'number' && Number.isInteger(value.row) &&
    typeof value.column === 'number' && Number.isInteger(value.column) &&
    typeof value.captured === 'boolean'
}

function validateState(value: unknown): value is AnimalChessState {
  if (!isStateShape(value) || value.version !== 1 || value.boardWidth !== 7 || value.boardHeight !== 9 ||
    typeof value.seed !== 'number' || !Number.isInteger(value.seed) || !isPlayer(value.currentPlayer) ||
    !isPhase(value.phase) || (value.winner !== null && !isPlayer(value.winner)) || !isDrawReason(value.drawReason) ||
    typeof value.quietRounds !== 'number' || !Number.isInteger(value.quietRounds) || value.quietRounds < 0 ||
    !Array.isArray(value.board) || value.board.length !== ANIMAL_CHESS_BOARD_CELLS ||
    !value.board.every((cell) => cell === null || typeof cell === 'string') ||
    !Array.isArray(value.pieces) || value.pieces.length !== 16 || !value.pieces.every(validatePiece) ||
    !Array.isArray(value.positionHistory) || !value.positionHistory.every((entry) => typeof entry === 'string') ||
    !Array.isArray(value.turns) || (value.setup !== undefined && !isAnimalChessSetup(value.setup))) return false

  const pieces = value.pieces
  const ids = new Set(pieces.map((piece) => piece.id))
  if (ids.size !== 16) return false
  if (value.board.some((id) => id !== null && !ids.has(id))) return false
  return value.turns.every((turn) => isStateShape(turn) && isPlayer(turn.player) && isCell(turn.from) && isCell(turn.to) &&
    (turn.capturedId === null || typeof turn.capturedId === 'string'))
}

export function serializeAnimalChessState(state: AnimalChessState): string {
  return JSON.stringify(state)
}

export function deserializeAnimalChessState(serialized: string): AnimalChessState {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('動物棋存檔格式錯誤')
  }
  if (!validateState(parsed)) throw new Error('動物棋存檔內容錯誤')
  const replayed = parsed.setup === undefined
    ? createAnimalChessState(parsed.seed)
    : createStateFromPieces(scenarioPieces(TUTORIAL_PLACEMENTS[parsed.setup]), parsed.setup, parsed.seed)
  let state = replayed
  for (const turn of parsed.turns) state = applyAnimalChessMove(state, { from: turn.from, to: turn.to })
  if (serializeAnimalChessState(state) !== serializeAnimalChessState(parsed)) throw new Error('動物棋存檔重播不一致')
  return parsed
}

function nextRandom(seed: number): readonly [number, number] {
  let value = seed >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  const nextSeed = value >>> 0
  return [nextSeed, nextSeed / 0x100000000]
}

export function chooseAnimalChessMove(state: AnimalChessState, seed = state.seed, difficulty: AnimalChessDifficulty = 'beginner'): AnimalMove | null {
  const legalMoves = [...getLegalAnimalChessMoves(state)]
  if (legalMoves.length === 0) return null
  const ranked = legalMoves.sort((first, second) => {
    const firstTarget = getAnimalPieceAt(state, first.to)
    const secondTarget = getAnimalPieceAt(state, second.to)
    const firstScore = firstTarget === null ? 0 : 100 + ANIMAL_RANK[firstTarget.kind]
    const secondScore = secondTarget === null ? 0 : 100 + ANIMAL_RANK[secondTarget.kind]
    return secondScore - firstScore
  })
  const [nextSeed, random] = nextRandom(seed + state.turns.length * 97)
  const bestScore = getAnimalPieceAt(state, ranked[0]!.to) === null ? 0 : 100
  const candidates = difficulty === 'beginner'
    ? legalMoves
    : ranked.filter((move) => (getAnimalPieceAt(state, move.to) === null ? 0 : 100) === bestScore)
  return candidates[Math.floor(random * candidates.length)] ?? ranked[nextSeed % ranked.length]!
}
