export type GoPlayer = 'black' | 'white'
export type GoStone = GoPlayer | null
export type GoBoardSize = 9 | 13 | 19
export type GoPhase = 'playing' | 'scoring' | 'finished'
export type GoAction =
  | { readonly type: 'play'; readonly point: number }
  | { readonly type: 'pass' }
  | { readonly type: 'resign' }
  | { readonly type: 'mark-dead'; readonly point: number }
  | { readonly type: 'agree-score' }
  | { readonly type: 'resume' }

export interface GoScore {
  readonly black: number
  readonly white: number
  readonly winner: GoPlayer | null
}

export interface GoMoveRecord {
  readonly player: GoPlayer
  readonly action: GoAction
  readonly captured: readonly number[]
}

export interface GoState {
  readonly version: 1
  readonly boardSize: GoBoardSize
  readonly board: readonly GoStone[]
  readonly startingPlayer: 'black'
  readonly currentPlayer: GoPlayer
  readonly phase: GoPhase
  readonly consecutivePasses: number
  readonly prisoners: Readonly<Record<GoPlayer, number>>
  readonly positionHistory: readonly string[]
  readonly deadStones: readonly number[]
  readonly scoreAgreedBy: readonly GoPlayer[]
  readonly result: GoScore | null
  readonly endReason: 'score' | 'resignation' | null
  readonly moves: readonly GoMoveRecord[]
}

export interface GoGroup {
  readonly stones: readonly number[]
  readonly liberties: readonly number[]
}

const VALID_SIZES = new Set<number>([9, 13, 19])
const other = (player: GoPlayer): GoPlayer => player === 'black' ? 'white' : 'black'

export function isGoBoardSize(value: unknown): value is GoBoardSize {
  return typeof value === 'number' && VALID_SIZES.has(value)
}

function isPlayer(value: unknown): value is GoPlayer {
  return value === 'black' || value === 'white'
}

function inBounds(size: number, row: number, column: number): boolean {
  return row >= 0 && row < size && column >= 0 && column < size
}

function adjacent(size: number, point: number): number[] {
  const row = Math.floor(point / size)
  const column = point % size
  return [[row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]]
    .filter(([nextRow, nextColumn]) => inBounds(size, nextRow!, nextColumn!))
    .map(([nextRow, nextColumn]) => nextRow! * size + nextColumn!)
}

export function getGoGroup(board: readonly GoStone[], size: GoBoardSize, point: number): GoGroup {
  const color = board[point]
  if (!isPlayer(color) || board.length !== size * size) return { stones: [], liberties: [] }
  const stones = new Set<number>([point])
  const liberties = new Set<number>()
  const pending = [point]
  while (pending.length > 0) {
    const current = pending.pop()!
    for (const next of adjacent(size, current)) {
      if (board[next] === null) liberties.add(next)
      else if (board[next] === color && !stones.has(next)) {
        stones.add(next)
        pending.push(next)
      }
    }
  }
  return { stones: [...stones].sort((a, b) => a - b), liberties: [...liberties].sort((a, b) => a - b) }
}

function positionKey(board: readonly GoStone[]): string {
  return board.map((stone) => stone === null ? '.' : stone === 'black' ? 'B' : 'W').join('')
}

export function createGoState(boardSize: GoBoardSize): GoState {
  if (!isGoBoardSize(boardSize)) throw new Error('圍棋棋盤只支援 9、13 或 19 路。')
  const board = Array.from<GoStone>({ length: boardSize * boardSize }).fill(null)
  return {
    version: 1,
    boardSize,
    board,
    startingPlayer: 'black',
    currentPlayer: 'black',
    phase: 'playing',
    consecutivePasses: 0,
    prisoners: { black: 0, white: 0 },
    positionHistory: [positionKey(board)],
    deadStones: [],
    scoreAgreedBy: [],
    result: null,
    endReason: null,
    moves: [],
  }
}

function requirePlaying(state: GoState): void {
  if (state.phase !== 'playing') throw new Error('目前不是落子階段。')
}

export function playGoMove(state: GoState, point: number): GoState {
  requirePlaying(state)
  if (!Number.isInteger(point) || point < 0 || point >= state.board.length || state.board[point] !== null) {
    throw new Error('請選擇棋盤上的空交點。')
  }
  const board = [...state.board]
  const player = state.currentPlayer
  const opponent = other(player)
  board[point] = player
  const captured = new Set<number>()
  for (const neighbor of adjacent(state.boardSize, point)) {
    if (board[neighbor] !== opponent) continue
    const group = getGoGroup(board, state.boardSize, neighbor)
    if (group.liberties.length === 0) group.stones.forEach((stone) => captured.add(stone))
  }
  for (const stone of captured) board[stone] = null
  if (getGoGroup(board, state.boardSize, point).liberties.length === 0) {
    throw new Error('這個位置沒有氣，不能下在這裡。')
  }
  const key = positionKey(board)
  if (state.positionHistory.includes(key)) throw new Error('這一步會讓整盤棋形重複，請選另一個位置。')
  return {
    ...state,
    board,
    currentPlayer: opponent,
    consecutivePasses: 0,
    prisoners: { ...state.prisoners, [player]: state.prisoners[player] + captured.size },
    positionHistory: [...state.positionHistory, key],
    deadStones: [],
    scoreAgreedBy: [],
    moves: [...state.moves, { player, action: { type: 'play', point }, captured: [...captured].sort((a, b) => a - b) }],
  }
}

export function passGoTurn(state: GoState): GoState {
  requirePlaying(state)
  const passes = state.consecutivePasses + 1
  const player = state.currentPlayer
  return {
    ...state,
    currentPlayer: other(player),
    phase: passes >= 2 ? 'scoring' : 'playing',
    consecutivePasses: passes,
    deadStones: [],
    scoreAgreedBy: [],
    moves: [...state.moves, { player, action: { type: 'pass' }, captured: [] }],
  }
}

export function resignGoGame(state: GoState): GoState {
  requirePlaying(state)
  const player = state.currentPlayer
  return {
    ...state,
    phase: 'finished',
    result: { black: 0, white: 0, winner: other(player) },
    endReason: 'resignation',
    moves: [...state.moves, { player, action: { type: 'resign' }, captured: [] }],
  }
}

export function toggleGoDeadGroup(state: GoState, point: number): GoState {
  if (state.phase !== 'scoring') throw new Error('只有終局確認時才能標記死棋。')
  if (!Number.isInteger(point) || point < 0 || point >= state.board.length || state.board[point] === null) {
    throw new Error('請選擇棋盤上的棋子。')
  }
  const group = getGoGroup(state.board, state.boardSize, point).stones
  const dead = new Set(state.deadStones)
  const shouldRestore = group.every((stone) => dead.has(stone))
  group.forEach((stone) => shouldRestore ? dead.delete(stone) : dead.add(stone))
  return {
    ...state,
    currentPlayer: other(state.currentPlayer),
    deadStones: [...dead].sort((a, b) => a - b),
    scoreAgreedBy: [],
    moves: [...state.moves, { player: state.currentPlayer, action: { type: 'mark-dead', point }, captured: [] }],
  }
}

export function calculateGoScore(state: Pick<GoState, 'board' | 'boardSize' | 'deadStones'>): GoScore {
  const board = [...state.board]
  for (const point of state.deadStones) if (Number.isInteger(point) && point >= 0 && point < board.length) board[point] = null
  let black = board.filter((stone) => stone === 'black').length
  let white = board.filter((stone) => stone === 'white').length
  const visited = new Set<number>()
  for (let point = 0; point < board.length; point += 1) {
    if (board[point] !== null || visited.has(point)) continue
    const region = new Set<number>([point])
    const borders = new Set<GoPlayer>()
    const pending = [point]
    visited.add(point)
    while (pending.length > 0) {
      const current = pending.pop()!
      for (const next of adjacent(state.boardSize, current)) {
        const stone = board[next]
        if (stone === null && !visited.has(next)) { visited.add(next); region.add(next); pending.push(next) }
        else if (isPlayer(stone)) borders.add(stone)
      }
    }
    if (borders.size === 1) {
      const owner = [...borders][0]
      if (owner === 'black') black += region.size
      else white += region.size
    }
  }
  return { black, white, winner: black === white ? null : black > white ? 'black' : 'white' }
}

export function agreeGoScore(state: GoState): GoState {
  if (state.phase !== 'scoring') throw new Error('目前不是終局確認階段。')
  const player = state.currentPlayer
  const accepted = new Set(state.scoreAgreedBy)
  accepted.add(player)
  if (accepted.has(other(player))) {
    const result = calculateGoScore(state)
    return {
      ...state,
      phase: 'finished',
      result,
      endReason: 'score',
      scoreAgreedBy: [...accepted],
      moves: [...state.moves, { player, action: { type: 'agree-score' }, captured: [] }],
    }
  }
  return {
    ...state,
    currentPlayer: other(player),
    scoreAgreedBy: [...accepted],
    moves: [...state.moves, { player, action: { type: 'agree-score' }, captured: [] }],
  }
}

export function resumeGoGame(state: GoState): GoState {
  if (state.phase !== 'scoring') throw new Error('目前不是終局確認階段。')
  return {
    ...state,
    phase: 'playing',
    consecutivePasses: 0,
    scoreAgreedBy: [],
    result: null,
    endReason: null,
    moves: [...state.moves, { player: state.currentPlayer, action: { type: 'resume' }, captured: [] }],
  }
}

export function getLegalGoMoves(state: GoState): readonly number[] {
  if (state.phase !== 'playing') return []
  const legal: number[] = []
  for (let point = 0; point < state.board.length; point += 1) {
    if (state.board[point] !== null) continue
    try { playGoMove(state, point); legal.push(point) } catch { /* 不合法落點不列入。 */ }
  }
  return legal
}

export function applyGoAction(state: GoState, action: GoAction): GoState {
  switch (action.type) {
    case 'play': return playGoMove(state, action.point)
    case 'pass': return passGoTurn(state)
    case 'resign': return resignGoGame(state)
    case 'mark-dead': return toggleGoDeadGroup(state, action.point)
    case 'agree-score': return agreeGoScore(state)
    case 'resume': return resumeGoGame(state)
  }
}

export function serializeGoState(state: GoState): string {
  // Worker 房間只需保存尺寸與著手；棋盤、提子、虛著、超劫歷史及計分狀態都由重播還原，
  // 避免每一步重複傳送整段局面歷史，讓長局仍能留在既有房間大小上限內。
  return JSON.stringify({ version: state.version, boardSize: state.boardSize, moves: state.moves })
}

export function deserializeGoState(serialized: string): GoState {
  let value: unknown
  try { value = JSON.parse(serialized) } catch { throw new Error('圍棋存檔不是有效的 JSON。') }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('圍棋存檔格式不正確。')
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || !isGoBoardSize(candidate.boardSize) || !Array.isArray(candidate.moves)) throw new Error('圍棋存檔版本、路數或著手紀錄不正確。')
  let replayed = createGoState(candidate.boardSize)
  for (const record of candidate.moves) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) throw new Error('圍棋著手紀錄格式不正確。')
    const move = record as Record<string, unknown>
    if (!isPlayer(move.player) || move.player !== replayed.currentPlayer || typeof move.action !== 'object' || move.action === null) throw new Error('圍棋著手順序不正確。')
    const action = move.action as GoAction
    if (!['play', 'pass', 'resign', 'mark-dead', 'agree-score', 'resume'].includes(action.type)) throw new Error('圍棋著手類型不正確。')
    try { replayed = applyGoAction(replayed, action) } catch { throw new Error('圍棋著手紀錄包含不合法步驟。') }
    if (!Array.isArray(move.captured) || JSON.stringify(move.captured) !== JSON.stringify(replayed.moves.at(-1)?.captured)) throw new Error('圍棋提子紀錄與局面不一致。')
  }
  if (serializeGoState(replayed) !== serialized) throw new Error('圍棋存檔內容與著手紀錄不一致。')
  return replayed
}
