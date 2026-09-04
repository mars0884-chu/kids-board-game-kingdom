export type NumberGemBoardSize = 3 | 4
export type NumberGemPuzzleType = 'combine' | 'take-away'
export type NumberGemPhase = 'playing' | 'completed'

export interface NumberGemPuzzle {
  version: 1
  id: string
  seed: number
  boardSize: NumberGemBoardSize
  board: readonly number[]
  type: NumberGemPuzzleType
  target: number
  start: number | null
  remaining: number | null
  minPathLength: number
  maxPathLength: number
  solutionCount: number
}

export interface NumberGemState {
  version: 1
  puzzle: NumberGemPuzzle
  path: readonly number[]
  currentTotal: number
  phase: NumberGemPhase
}

export type NumberGemPathStatus = 'playing' | 'completed' | 'over' | 'invalid'

export interface NumberGemPathEvaluation {
  status: NumberGemPathStatus
  total: number
  reason: 'ok' | 'target-reached' | 'over-target' | 'repeated-cell' | 'non-adjacent' | 'too-short' | 'too-long' | 'out-of-range'
}

function isPuzzleType(value: unknown): value is NumberGemPuzzleType {
  return value === 'combine' || value === 'take-away'
}

function isBoardSize(value: unknown): value is NumberGemBoardSize {
  return value === 3 || value === 4
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export function areNumberGemCellsAdjacent(
  first: number,
  second: number,
  boardSize: NumberGemBoardSize,
): boolean {
  const firstRow = Math.floor(first / boardSize)
  const firstColumn = first % boardSize
  const secondRow = Math.floor(second / boardSize)
  const secondColumn = second % boardSize
  return Math.abs(firstRow - secondRow) + Math.abs(firstColumn - secondColumn) === 1
}

export function calculateNumberGemPathTotal(
  puzzle: NumberGemPuzzle,
  path: readonly number[],
): number {
  return path.reduce((total, cellIndex) => total + (puzzle.board[cellIndex] ?? 0), 0)
}

function pathContainsDuplicate(path: readonly number[]): boolean {
  return new Set(path).size !== path.length
}

export function evaluateNumberGemPath(
  puzzle: NumberGemPuzzle,
  path: readonly number[],
): NumberGemPathEvaluation {
  if (path.some((cellIndex) => !Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= puzzle.board.length)) {
    return { status: 'invalid', total: 0, reason: 'out-of-range' }
  }

  if (pathContainsDuplicate(path)) {
    return { status: 'invalid', total: calculateNumberGemPathTotal(puzzle, path), reason: 'repeated-cell' }
  }

  for (let index = 1; index < path.length; index += 1) {
    if (!areNumberGemCellsAdjacent(path[index - 1]!, path[index]!, puzzle.boardSize)) {
      return { status: 'invalid', total: calculateNumberGemPathTotal(puzzle, path), reason: 'non-adjacent' }
    }
  }

  const total = calculateNumberGemPathTotal(puzzle, path)
  if (path.length > puzzle.maxPathLength) {
    return { status: 'invalid', total, reason: 'too-long' }
  }
  if (total === puzzle.target && path.length >= puzzle.minPathLength) {
    return { status: 'completed', total, reason: 'target-reached' }
  }
  if (total > puzzle.target) {
    return { status: 'over', total, reason: 'over-target' }
  }
  if (path.length < puzzle.minPathLength) {
    return { status: 'playing', total, reason: 'too-short' }
  }
  return { status: 'playing', total, reason: 'ok' }
}

export function createNumberGemState(puzzle: NumberGemPuzzle): NumberGemState {
  return {
    version: 1,
    puzzle,
    path: [],
    currentTotal: 0,
    phase: 'playing',
  }
}

export function chooseNumberGemCell(
  state: NumberGemState,
  cellIndex: number,
): { state: NumberGemState; evaluation: NumberGemPathEvaluation } {
  if (state.phase === 'completed') {
    return {
      state,
      evaluation: { status: 'invalid', total: state.currentTotal, reason: 'too-long' },
    }
  }

  const nextPath = [...state.path, cellIndex]
  const evaluation = evaluateNumberGemPath(state.puzzle, nextPath)
  if (evaluation.status === 'invalid') {
    return { state, evaluation }
  }

  return {
    state: {
      ...state,
      path: nextPath,
      currentTotal: evaluation.total,
      phase: evaluation.status === 'completed' ? 'completed' : 'playing',
    },
    evaluation,
  }
}

export function undoNumberGemCell(state: NumberGemState): NumberGemState {
  if (state.phase === 'completed' || state.path.length === 0) {
    return state
  }

  const path = state.path.slice(0, -1)
  const evaluation = evaluateNumberGemPath(state.puzzle, path)
  return {
    ...state,
    path,
    currentTotal: evaluation.total,
    phase: 'playing',
  }
}

function validatePuzzle(puzzle: unknown): puzzle is NumberGemPuzzle {
  if (typeof puzzle !== 'object' || puzzle === null || Array.isArray(puzzle)) {
    return false
  }

  const candidate = puzzle as Record<string, unknown>
  if (candidate.version !== 1 || typeof candidate.id !== 'string' || !isInteger(candidate.seed)) {
    return false
  }
  if (!isBoardSize(candidate.boardSize) || !Array.isArray(candidate.board)) {
    return false
  }
  if (candidate.board.length !== candidate.boardSize * candidate.boardSize || candidate.board.some((value) => !isInteger(value) || value < 1)) {
    return false
  }
  if (!isPuzzleType(candidate.type) || !isInteger(candidate.target) || candidate.target < 1) {
    return false
  }
  if (!(candidate.start === null || isInteger(candidate.start)) || !(candidate.remaining === null || isInteger(candidate.remaining))) {
    return false
  }
  if (!isInteger(candidate.minPathLength) || !isInteger(candidate.maxPathLength) || candidate.minPathLength < 2 || candidate.maxPathLength < candidate.minPathLength || candidate.maxPathLength > 4) {
    return false
  }
  return isInteger(candidate.solutionCount) && candidate.solutionCount >= 1
}

export function serializeNumberGemState(state: NumberGemState): string {
  return JSON.stringify(state)
}

export function deserializeNumberGemState(serialized: string): NumberGemState {
  const parsed: unknown = JSON.parse(serialized)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('數字寶石存檔格式錯誤')
  }

  const candidate = parsed as Record<string, unknown>
  if (candidate.version !== 1 || !validatePuzzle(candidate.puzzle) || !Array.isArray(candidate.path)) {
    throw new Error('數字寶石存檔內容錯誤')
  }

  const path = candidate.path
  if (path.some((cellIndex) => !isInteger(cellIndex))) {
    throw new Error('數字寶石路徑格式錯誤')
  }
  const evaluation = evaluateNumberGemPath(candidate.puzzle, path)
  if (evaluation.status === 'invalid' || candidate.currentTotal !== evaluation.total) {
    throw new Error('數字寶石路徑驗證失敗')
  }
  const phase = candidate.phase
  if (phase !== 'playing' && phase !== 'completed') {
    throw new Error('數字寶石回合狀態錯誤')
  }
  if ((phase === 'completed') !== (evaluation.status === 'completed')) {
    throw new Error('數字寶石完成狀態錯誤')
  }

  return {
    version: 1,
    puzzle: candidate.puzzle,
    path,
    currentTotal: evaluation.total,
    phase,
  }
}
