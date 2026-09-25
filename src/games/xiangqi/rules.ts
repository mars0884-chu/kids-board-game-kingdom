export type XiangqiPlayer = 'red' | 'black'
export type XiangqiKind = 'king' | 'advisor' | 'elephant' | 'horse' | 'chariot' | 'cannon' | 'soldier'
export type XiangqiCell = XiangqiPiece | null
export type XiangqiPhase = 'playing' | 'check' | 'won' | 'draw'
export type XiangqiDrawReason = 'mutual-agreement' | 'insufficient-material' | 'repetition'

export const XIANGQI_BOARD_WIDTH = 9
export const XIANGQI_BOARD_HEIGHT = 10
export const XIANGQI_BOARD_CELLS = XIANGQI_BOARD_WIDTH * XIANGQI_BOARD_HEIGHT
export const XIANGQI_DEFAULT_REPETITION_LIMIT: number | null = null

export interface XiangqiPiece {
  readonly id: string
  readonly owner: XiangqiPlayer
  readonly kind: XiangqiKind
  readonly row: number
  readonly column: number
}

export interface XiangqiMove {
  readonly from: number
  readonly to: number
  readonly player: XiangqiPlayer
  readonly pieceId: string
  readonly capturedId: string | null
}

export interface XiangqiRuleOptions {
  readonly repetitionLimit: number | null
}

export interface XiangqiState {
  readonly version: 1
  readonly boardWidth: 9
  readonly boardHeight: 10
  readonly board: readonly XiangqiCell[]
  readonly currentPlayer: XiangqiPlayer
  readonly phase: XiangqiPhase
  readonly winner: XiangqiPlayer | null
  readonly drawReason: XiangqiDrawReason | null
  readonly options: XiangqiRuleOptions
  readonly positionHistory: readonly string[]
  readonly repetitionCounts: Readonly<Record<string, number>>
  readonly turns: readonly XiangqiMove[]
}

export interface XiangqiPlacement {
  readonly owner: XiangqiPlayer
  readonly kind: XiangqiKind
  readonly row: number
  readonly column: number
}

const ORTHOGONAL_DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

const DIAGONAL_DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

const HORSE_STEPS: readonly { readonly row: number; readonly column: number; readonly legRow: number; readonly legColumn: number }[] = [
  { row: -2, column: -1, legRow: -1, legColumn: 0 },
  { row: -2, column: 1, legRow: -1, legColumn: 0 },
  { row: 2, column: -1, legRow: 1, legColumn: 0 },
  { row: 2, column: 1, legRow: 1, legColumn: 0 },
  { row: -1, column: -2, legRow: 0, legColumn: -1 },
  { row: 1, column: -2, legRow: 0, legColumn: -1 },
  { row: -1, column: 2, legRow: 0, legColumn: 1 },
  { row: 1, column: 2, legRow: 0, legColumn: 1 },
]

const KIND_CODE: Readonly<Record<XiangqiKind, string>> = {
  king: 'k',
  advisor: 'a',
  elephant: 'e',
  horse: 'h',
  chariot: 'r',
  cannon: 'c',
  soldier: 's',
}

const BACK_RANK: readonly XiangqiKind[] = [
  'chariot',
  'horse',
  'elephant',
  'advisor',
  'king',
  'advisor',
  'elephant',
  'horse',
  'chariot',
]

const STANDARD_PLACEMENTS: readonly XiangqiPlacement[] = [
  ...BACK_RANK.map((kind, column) => ({ owner: 'black' as const, kind, row: 0, column })),
  { owner: 'black', kind: 'cannon', row: 2, column: 1 },
  { owner: 'black', kind: 'cannon', row: 2, column: 7 },
  ...[0, 2, 4, 6, 8].map((column) => ({ owner: 'black' as const, kind: 'soldier' as const, row: 3, column })),
  { owner: 'red', kind: 'cannon', row: 7, column: 1 },
  { owner: 'red', kind: 'cannon', row: 7, column: 7 },
  ...[0, 2, 4, 6, 8].map((column) => ({ owner: 'red' as const, kind: 'soldier' as const, row: 6, column })),
  ...BACK_RANK.map((kind, column) => ({ owner: 'red' as const, kind, row: 9, column })),
]

function otherPlayer(player: XiangqiPlayer): XiangqiPlayer {
  return player === 'red' ? 'black' : 'red'
}

function isPlayer(value: unknown): value is XiangqiPlayer {
  return value === 'red' || value === 'black'
}

function isKind(value: unknown): value is XiangqiKind {
  return value === 'king' || value === 'advisor' || value === 'elephant' || value === 'horse' ||
    value === 'chariot' || value === 'cannon' || value === 'soldier'
}

function toCell(row: number, column: number): number {
  return row * XIANGQI_BOARD_WIDTH + column
}

export function toXiangqiCoordinate(cell: number): readonly [number, number] {
  if (!isCell(cell)) throw new Error('象棋位置超出棋盤範圍。')
  return [Math.floor(cell / XIANGQI_BOARD_WIDTH), cell % XIANGQI_BOARD_WIDTH]
}

export function isCell(cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < XIANGQI_BOARD_CELLS
}

function inBounds(row: number, column: number): boolean {
  return row >= 0 && row < XIANGQI_BOARD_HEIGHT && column >= 0 && column < XIANGQI_BOARD_WIDTH
}

function isPalaceCell(player: XiangqiPlayer, row: number, column: number): boolean {
  return column >= 3 && column <= 5 && (player === 'black' ? row <= 2 : row >= 7)
}

function isOwnSide(player: XiangqiPlayer, row: number): boolean {
  return player === 'black' ? row <= 4 : row >= 5
}

function isAcrossRiver(player: XiangqiPlayer, row: number): boolean {
  return player === 'black' ? row >= 5 : row <= 4
}

function createPieces(placements: readonly XiangqiPlacement[]): readonly XiangqiPiece[] {
  const counters = new Map<string, number>()
  return placements.map(({ owner, kind, row, column }) => {
    const counterKey = `${owner}-${kind}`
    const count = (counters.get(counterKey) ?? 0) + 1
    counters.set(counterKey, count)
    return { id: `${counterKey}-${count}`, owner, kind, row, column }
  })
}

function createBoard(pieces: readonly XiangqiPiece[]): readonly XiangqiCell[] {
  const board: XiangqiCell[] = Array.from({ length: XIANGQI_BOARD_CELLS }, () => null)
  for (const piece of pieces) {
    const cell = toCell(piece.row, piece.column)
    if (board[cell] !== null) throw new Error('象棋初始局面出現重疊棋子。')
    board[cell] = piece
  }
  return board
}

function normalizeOptions(options?: Partial<XiangqiRuleOptions>): XiangqiRuleOptions {
  const repetitionLimit = options?.repetitionLimit ?? XIANGQI_DEFAULT_REPETITION_LIMIT
  if (repetitionLimit !== null && (!Number.isInteger(repetitionLimit) || repetitionLimit < 2)) {
    throw new Error('象棋反覆局面門檻必須是 null 或至少 2。')
  }
  return { repetitionLimit }
}

export function positionKey(state: Pick<XiangqiState, 'board' | 'currentPlayer'>): string {
  const boardKey = state.board.map((piece) => piece === null
    ? '.'
    : `${piece.owner === 'red' ? 'r' : 'b'}${KIND_CODE[piece.kind]}`,
  ).join('')
  return `${state.currentPlayer}|${boardKey}`
}

export function createInitialXiangqiState(options?: Partial<XiangqiRuleOptions>): XiangqiState {
  const pieces = createPieces(STANDARD_PLACEMENTS)
  const board = createBoard(pieces)
  const normalizedOptions = normalizeOptions(options)
  const initialState = {
    version: 1 as const,
    boardWidth: 9 as const,
    boardHeight: 10 as const,
    board,
    currentPlayer: 'red' as const,
    phase: 'playing' as const,
    winner: null,
    drawReason: null,
    options: normalizedOptions,
    positionHistory: [] as readonly string[],
    repetitionCounts: {} as Readonly<Record<string, number>>,
    turns: [] as readonly XiangqiMove[],
  }
  const initialKey = positionKey(initialState)
  return {
    ...initialState,
    positionHistory: [initialKey],
    repetitionCounts: { [initialKey]: 1 },
  }
}

export function pieceAt(state: Pick<XiangqiState, 'board'>, cell: number): XiangqiCell {
  if (!isCell(cell)) throw new Error('象棋位置超出棋盤範圍。')
  return state.board[cell] ?? null
}

function pathIsClear(state: Pick<XiangqiState, 'board'>, fromRow: number, fromColumn: number, toRow: number, toColumn: number): boolean {
  const rowStep = Math.sign(toRow - fromRow)
  const columnStep = Math.sign(toColumn - fromColumn)
  let row = fromRow + rowStep
  let column = fromColumn + columnStep
  while (row !== toRow || column !== toColumn) {
    if (state.board[toCell(row, column)] !== null) return false
    row += rowStep
    column += columnStep
  }
  return true
}

function countPiecesBetween(state: Pick<XiangqiState, 'board'>, fromRow: number, fromColumn: number, toRow: number, toColumn: number): number {
  const rowStep = Math.sign(toRow - fromRow)
  const columnStep = Math.sign(toColumn - fromColumn)
  let row = fromRow + rowStep
  let column = fromColumn + columnStep
  let count = 0
  while (row !== toRow || column !== toColumn) {
    if (state.board[toCell(row, column)] !== null) count += 1
    row += rowStep
    column += columnStep
  }
  return count
}

function canLand(state: Pick<XiangqiState, 'board'>, piece: XiangqiPiece, row: number, column: number): boolean {
  if (!inBounds(row, column)) return false
  const target = state.board[toCell(row, column)]
  return target === null || (target.owner !== piece.owner && target.kind !== 'king')
}

function pushMove(
  state: Pick<XiangqiState, 'board'>,
  piece: XiangqiPiece,
  from: number,
  row: number,
  column: number,
  moves: XiangqiMove[],
): void {
  if (!canLand(state, piece, row, column)) return
  const target = state.board[toCell(row, column)]
  moves.push({
    from,
    to: toCell(row, column),
    player: piece.owner,
    pieceId: piece.id,
    capturedId: target?.id ?? null,
  })
}

function pseudoMovesForPiece(state: Pick<XiangqiState, 'board'>, piece: XiangqiPiece): XiangqiMove[] {
  const from = toCell(piece.row, piece.column)
  const moves: XiangqiMove[] = []
  if (piece.kind === 'king') {
    for (const [rowStep, columnStep] of ORTHOGONAL_DIRECTIONS) {
      const row = piece.row + rowStep
      const column = piece.column + columnStep
      if (isPalaceCell(piece.owner, row, column)) pushMove(state, piece, from, row, column, moves)
    }
    return moves
  }
  if (piece.kind === 'advisor') {
    for (const [rowStep, columnStep] of DIAGONAL_DIRECTIONS) {
      const row = piece.row + rowStep
      const column = piece.column + columnStep
      if (isPalaceCell(piece.owner, row, column)) pushMove(state, piece, from, row, column, moves)
    }
    return moves
  }
  if (piece.kind === 'elephant') {
    for (const [rowStep, columnStep] of DIAGONAL_DIRECTIONS) {
      const row = piece.row + rowStep * 2
      const column = piece.column + columnStep * 2
      const eyeRow = piece.row + rowStep
      const eyeColumn = piece.column + columnStep
      if (inBounds(row, column) && isOwnSide(piece.owner, row) && state.board[toCell(eyeRow, eyeColumn)] === null) {
        pushMove(state, piece, from, row, column, moves)
      }
    }
    return moves
  }
  if (piece.kind === 'horse') {
    for (const step of HORSE_STEPS) {
      const legRow = piece.row + step.legRow
      const legColumn = piece.column + step.legColumn
      const row = piece.row + step.row
      const column = piece.column + step.column
      if (inBounds(row, column) && state.board[toCell(legRow, legColumn)] === null) {
        pushMove(state, piece, from, row, column, moves)
      }
    }
    return moves
  }
  if (piece.kind === 'soldier') {
    const forward = piece.owner === 'red' ? -1 : 1
    pushMove(state, piece, from, piece.row + forward, piece.column, moves)
    if (isAcrossRiver(piece.owner, piece.row)) {
      pushMove(state, piece, from, piece.row, piece.column - 1, moves)
      pushMove(state, piece, from, piece.row, piece.column + 1, moves)
    }
    return moves
  }
  for (const [rowStep, columnStep] of ORTHOGONAL_DIRECTIONS) {
    let row = piece.row + rowStep
    let column = piece.column + columnStep
    let hasScreen = false
    while (inBounds(row, column)) {
      const target = state.board[toCell(row, column)]
      if (piece.kind === 'chariot') {
        if (target === null) {
          pushMove(state, piece, from, row, column, moves)
        } else {
          if (target.owner !== piece.owner && target.kind !== 'king') pushMove(state, piece, from, row, column, moves)
          break
        }
      } else if (!hasScreen) {
        if (target === null) {
          pushMove(state, piece, from, row, column, moves)
        } else {
          hasScreen = true
        }
      } else if (target !== null) {
        if (target.owner !== piece.owner && target.kind !== 'king') pushMove(state, piece, from, row, column, moves)
        break
      }
      row += rowStep
      column += columnStep
    }
  }
  return moves
}

function pieceAttacksCell(state: Pick<XiangqiState, 'board'>, piece: XiangqiPiece, targetRow: number, targetColumn: number): boolean {
  const rowDelta = targetRow - piece.row
  const columnDelta = targetColumn - piece.column
  if (rowDelta === 0 && columnDelta === 0) return false
  if (piece.kind === 'king') {
    return (Math.abs(rowDelta) + Math.abs(columnDelta) === 1) ||
      ((rowDelta === 0 || columnDelta === 0) && pathIsClear(state, piece.row, piece.column, targetRow, targetColumn))
  }
  if (piece.kind === 'advisor') {
    return Math.abs(rowDelta) === 1 && Math.abs(columnDelta) === 1 && isPalaceCell(piece.owner, targetRow, targetColumn)
  }
  if (piece.kind === 'elephant') {
    return Math.abs(rowDelta) === 2 && Math.abs(columnDelta) === 2 && isOwnSide(piece.owner, targetRow) &&
      state.board[toCell(piece.row + rowDelta / 2, piece.column + columnDelta / 2)] === null
  }
  if (piece.kind === 'horse') {
    const step = HORSE_STEPS.find((candidate) => candidate.row === rowDelta && candidate.column === columnDelta)
    return step !== undefined && state.board[toCell(piece.row + step.legRow, piece.column + step.legColumn)] === null
  }
  if (piece.kind === 'soldier') {
    const forward = piece.owner === 'red' ? -1 : 1
    return (rowDelta === forward && columnDelta === 0) ||
      (isAcrossRiver(piece.owner, piece.row) && rowDelta === 0 && Math.abs(columnDelta) === 1)
  }
  if (rowDelta !== 0 && columnDelta !== 0) return false
  const piecesBetween = countPiecesBetween(state, piece.row, piece.column, targetRow, targetColumn)
  return piece.kind === 'chariot' ? piecesBetween === 0 : piecesBetween === 1
}

function boardAfterMove(state: Pick<XiangqiState, 'board'>, move: XiangqiMove): readonly XiangqiCell[] {
  const board = [...state.board]
  const piece = board[move.from]
  if (piece === null || piece.id !== move.pieceId) throw new Error('象棋走棋資料與棋盤不一致。')
  const [row, column] = toXiangqiCoordinate(move.to)
  board[move.from] = null
  board[move.to] = { ...piece, row, column }
  return board
}

export function isInCheck(state: Pick<XiangqiState, 'board'>, player: XiangqiPlayer): boolean {
  const kingCell = state.board.findIndex((piece) => piece?.owner === player && piece.kind === 'king')
  if (kingCell < 0) return true
  const [kingRow, kingColumn] = toXiangqiCoordinate(kingCell)
  return state.board.some((piece) => piece !== null && piece.owner !== player && pieceAttacksCell(state, piece, kingRow, kingColumn))
}

function pseudoMovesForPlayer(state: Pick<XiangqiState, 'board'>, player: XiangqiPlayer): XiangqiMove[] {
  return state.board.flatMap((piece) => piece?.owner === player ? pseudoMovesForPiece(state, piece) : [])
}

export function getLegalMoves(state: Pick<XiangqiState, 'board' | 'currentPlayer'>, player: XiangqiPlayer = state.currentPlayer): readonly XiangqiMove[] {
  return pseudoMovesForPlayer(state, player).filter((move) => {
    const nextBoard = boardAfterMove(state, move)
    return !isInCheck({ board: nextBoard }, player)
  })
}

export function getLegalMovesFrom(state: Pick<XiangqiState, 'board' | 'currentPlayer'>, from: number, player: XiangqiPlayer = state.currentPlayer): readonly XiangqiMove[] {
  return getLegalMoves(state, player).filter((move) => move.from === from)
}

export function hasAnyLegalMove(state: Pick<XiangqiState, 'board' | 'currentPlayer'>, player: XiangqiPlayer = state.currentPlayer): boolean {
  return getLegalMoves(state, player).length > 0
}

function hasMatingMaterial(state: Pick<XiangqiState, 'board'>, player: XiangqiPlayer): boolean {
  return state.board.some((piece) => piece?.owner === player && (piece.kind === 'chariot' || piece.kind === 'cannon' || piece.kind === 'horse' || piece.kind === 'soldier'))
}

export function isInsufficientMatingMaterial(state: Pick<XiangqiState, 'board'>): boolean {
  return !hasMatingMaterial(state, 'red') && !hasMatingMaterial(state, 'black')
}

function nextTerminalStatus(state: XiangqiState): Pick<XiangqiState, 'phase' | 'winner' | 'drawReason'> {
  const nextPlayer = state.currentPlayer
  const legalMoves = getLegalMoves(state, nextPlayer)
  if (legalMoves.length === 0) {
    return { phase: 'won', winner: otherPlayer(nextPlayer), drawReason: null }
  }
  if (isInsufficientMatingMaterial(state)) {
    return { phase: 'draw', winner: null, drawReason: 'insufficient-material' }
  }
  // 協會 113 年修訂版須先分類雙方的長將、長捉與未犯例。
  // 局面重複次數只供偵測，不得直接作為正式和局判決。
  return { phase: isInCheck(state, nextPlayer) ? 'check' : 'playing', winner: null, drawReason: null }
}

export function applyMove(state: XiangqiState, from: number, to: number): XiangqiState {
  if (state.phase === 'won' || state.phase === 'draw') throw new Error('象棋對局已結束，不能再走棋。')
  const move = getLegalMoves(state).find((candidate) => candidate.from === from && candidate.to === to)
  if (move === undefined) throw new Error('這一步不是目前棋局的合法走法。')
  const board = boardAfterMove(state, move)
  const nextPlayer = otherPlayer(state.currentPlayer)
  const nextKey = positionKey({ board, currentPlayer: nextPlayer })
  const repetitionCounts = {
    ...state.repetitionCounts,
    [nextKey]: (state.repetitionCounts[nextKey] ?? 0) + 1,
  }
  const nextState: XiangqiState = {
    ...state,
    board,
    currentPlayer: nextPlayer,
    positionHistory: [...state.positionHistory, nextKey],
    repetitionCounts,
    turns: [...state.turns, move],
    phase: 'playing',
    winner: null,
    drawReason: null,
  }
  return { ...nextState, ...nextTerminalStatus(nextState) }
}

export function agreeDraw(state: XiangqiState): XiangqiState {
  if (state.phase === 'won' || state.phase === 'draw') throw new Error('象棋對局已經結束。')
  return { ...state, phase: 'draw', winner: null, drawReason: 'mutual-agreement' }
}

function isPhase(value: unknown): value is XiangqiPhase {
  return value === 'playing' || value === 'check' || value === 'won' || value === 'draw'
}

function isDrawReason(value: unknown): value is XiangqiDrawReason | null {
  return value === null || value === 'mutual-agreement' || value === 'insufficient-material' || value === 'repetition'
}

export function isValidXiangqiState(value: unknown): value is XiangqiState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<XiangqiState>
  if (candidate.version !== 1 || candidate.boardWidth !== 9 || candidate.boardHeight !== 10 || !Array.isArray(candidate.board) || candidate.board.length !== XIANGQI_BOARD_CELLS) return false
  if (!isPlayer(candidate.currentPlayer) || !isPhase(candidate.phase) || !isPlayer(candidate.winner) && candidate.winner !== null || !isDrawReason(candidate.drawReason)) return false
  if (typeof candidate.options !== 'object' || candidate.options === null) return false
  const repetitionLimit = (candidate.options as Partial<XiangqiRuleOptions>).repetitionLimit
  if (repetitionLimit !== null && (!Number.isInteger(repetitionLimit) || (repetitionLimit as number) < 2)) return false
  if (!Array.isArray(candidate.positionHistory) || candidate.positionHistory.some((entry) => typeof entry !== 'string')) return false
  if (typeof candidate.repetitionCounts !== 'object' || candidate.repetitionCounts === null) return false
  if (!Array.isArray(candidate.turns)) return false
  const ids = new Set<string>()
  const kings: Record<XiangqiPlayer, number> = { red: 0, black: 0 }
  for (let cell = 0; cell < candidate.board.length; cell += 1) {
    const piece = candidate.board[cell]
    if (piece === null) continue
    if (typeof piece !== 'object') return false
    const candidatePiece = piece as Partial<XiangqiPiece>
    if (!isPlayer(candidatePiece.owner) || !isKind(candidatePiece.kind) || typeof candidatePiece.id !== 'string' || ids.has(candidatePiece.id) || typeof candidatePiece.row !== 'number' || typeof candidatePiece.column !== 'number' || !Number.isInteger(candidatePiece.row) || !Number.isInteger(candidatePiece.column) || toCell(candidatePiece.row, candidatePiece.column) !== cell) return false
    ids.add(candidatePiece.id)
    if (candidatePiece.kind === 'king') kings[candidatePiece.owner] += 1
  }
  return kings.red === 1 && kings.black === 1
}

export function serializeXiangqiState(state: XiangqiState): string {
  if (!isValidXiangqiState(state)) throw new Error('不能序列化無效的象棋局面。')
  return JSON.stringify(state)
}

export function deserializeXiangqiState(serialized: string): XiangqiState {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  } catch {
    throw new Error('象棋存檔不是有效的 JSON。')
  }
  if (!isValidXiangqiState(parsed)) throw new Error('象棋存檔格式或局面不合法。')
  return parsed
}
