import type { TurnGamePhase, TurnGameRules } from '../core/turn-game'

export type JumpPlayer = 'player1' | 'player2'
export type JumpCell = string | null
export type JumpMoveKind = 'step' | 'jump'
export type JumpDrawReason = 'mutual-no-moves' | 'threefold'

export const JUMP_CHESS_BOARD_CELLS = 121
export const JUMP_CHESS_CAMP_SIZE = 10
export const JUMP_CHESS_DEFAULT_SEED = 0x130d04
export const JUMP_CHESS_TUTORIAL_COUNT = 6

export interface JumpCoordinate {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface JumpHole extends JumpCoordinate {
  readonly cell: number
  readonly campIndex: number | null
  readonly campOwner: JumpPlayer | null
  readonly layoutX: number
  readonly layoutY: number
}

export interface JumpPiece {
  readonly id: string
  readonly owner: JumpPlayer
  readonly cell: number
  readonly enteredTargetCamp: boolean
}

export interface JumpMove {
  readonly from: number
  readonly to: number
  readonly kind: JumpMoveKind
}

export interface JumpMoveTurnRecord {
  readonly kind: 'move'
  readonly player: JumpPlayer
  readonly moveKind: JumpMoveKind
  readonly path: readonly number[]
}

export interface JumpPassTurnRecord {
  readonly kind: 'pass'
  readonly player: JumpPlayer
}

export type JumpTurnRecord = JumpMoveTurnRecord | JumpPassTurnRecord

export interface JumpActiveSequence {
  readonly player: JumpPlayer
  readonly pieceId: string
  readonly origin: number
  readonly path: readonly number[]
}

export interface JumpChessState {
  readonly version: 1
  readonly boardSize: 121
  readonly seed: number
  readonly startingPlayer: JumpPlayer
  readonly initialPieces: readonly JumpPiece[]
  readonly board: readonly JumpCell[]
  readonly pieces: readonly JumpPiece[]
  readonly currentPlayer: JumpPlayer
  readonly phase: TurnGamePhase
  readonly winner: JumpPlayer | null
  readonly drawReason: JumpDrawReason | null
  readonly turnCount: number
  readonly consecutivePasses: number
  readonly positionHistory: readonly string[]
  readonly turns: readonly JumpTurnRecord[]
  readonly activeJump: JumpActiveSequence | null
}

export interface JumpPiecePlacement {
  readonly owner: JumpPlayer
  readonly cell: number
  readonly id?: string
  readonly enteredTargetCamp?: boolean
}

type Cube = readonly [number, number, number]

const DIRECTIONS: readonly Cube[] = [
  [0, -1, 1],
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
]

export const JUMP_CHESS_CAMP_OWNERS: readonly (JumpPlayer | null)[] = [
  'player2',
  null,
  null,
  'player1',
  null,
  null,
]

export const JUMP_CHESS_STANDARD_ROW_LENGTHS = Object.freeze([1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1])

const BOARD_MARGIN = 0.72

function coordinateKey(coordinate: JumpCoordinate): string {
  return `${coordinate.x},${coordinate.y},${coordinate.z}`
}

function campIndexForRow(z: number, column: number, rowLength: number): number | null {
  if (z <= -5) return 0
  if (z >= 5) return 3
  if (z < 0) {
    const sideLength = -z
    if (column < sideLength) return 5
    if (column >= rowLength - sideLength) return 1
  }
  if (z > 0) {
    const sideLength = z
    if (column < sideLength) return 4
    if (column >= rowLength - sideLength) return 2
  }
  return null
}

function createJumpHoles(): readonly JumpHole[] {
  const unsorted = JUMP_CHESS_STANDARD_ROW_LENGTHS.flatMap((rowLength, rowIndex) => {
    const z = rowIndex - 8
    const xStart = -(rowLength - 1 + z) / 2
    return Array.from({ length: rowLength }, (_, column) => {
      const x = xStart + column
      const y = -x - z
      const campIndex = campIndexForRow(z, column, rowLength)
      return {
        coordinate: { x, y, z },
        campIndex,
        campOwner: campIndex === null ? null : JUMP_CHESS_CAMP_OWNERS[campIndex] ?? null,
        // 正式 121 孔棋盤使用水平列：17 列孔數固定為
        // 1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1。
        screenX: column - (rowLength - 1) / 2,
        screenY: z * (Math.sqrt(3) / 2),
      }
    })
  })
  const minX = Math.min(...unsorted.map((entry) => entry.screenX))
  const minY = Math.min(...unsorted.map((entry) => entry.screenY))

  return Object.freeze(unsorted
    .sort((first, second) => first.screenY - second.screenY || first.screenX - second.screenX)
    .map(({ coordinate, campIndex, campOwner, screenX, screenY }, cell) => Object.freeze({
      ...coordinate,
      cell,
      campIndex,
      campOwner,
      layoutX: screenX - minX + BOARD_MARGIN,
      layoutY: screenY - minY + BOARD_MARGIN,
    })))
}

export const JUMP_CHESS_HOLES = createJumpHoles()
export const JUMP_CHESS_LAYOUT_SPAN_WIDTH = Math.max(...JUMP_CHESS_HOLES.map((hole) => hole.layoutX)) + BOARD_MARGIN
export const JUMP_CHESS_LAYOUT_SPAN_HEIGHT = Math.max(...JUMP_CHESS_HOLES.map((hole) => hole.layoutY)) + BOARD_MARGIN
export const JUMP_CHESS_LAYOUT_WIDTH = JUMP_CHESS_LAYOUT_SPAN_WIDTH
export const JUMP_CHESS_LAYOUT_HEIGHT = JUMP_CHESS_LAYOUT_SPAN_HEIGHT

const HOLE_BY_KEY = new Map(JUMP_CHESS_HOLES.map((hole) => [coordinateKey(hole), hole]))

export interface JumpBoardPoint {
  readonly x: number
  readonly y: number
}

function pointFromHole(hole: JumpHole): JumpBoardPoint {
  return { x: hole.layoutX, y: hole.layoutY }
}

function cross(origin: JumpBoardPoint, first: JumpBoardPoint, second: JumpBoardPoint): number {
  return (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
}

function convexHull(points: readonly JumpBoardPoint[]): readonly JumpBoardPoint[] {
  const sorted = [...points].sort((first, second) => first.x - second.x || first.y - second.y)
  const lower: JumpBoardPoint[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 1e-9) lower.pop()
    lower.push(point)
  }
  const upper: JumpBoardPoint[] = []
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 1e-9) upper.pop()
    upper.push(point)
  }
  return Object.freeze([...lower.slice(0, -1), ...upper.slice(0, -1)])
}

function extreme(points: readonly JumpBoardPoint[], compare: (first: JumpBoardPoint, second: JumpBoardPoint) => number): JumpBoardPoint {
  const point = [...points].sort(compare)[0]
  if (point === undefined) throw new Error('跳棋棋盤幾何資料不完整。')
  return point
}

export const JUMP_CHESS_CAMP_TRIANGLES: readonly (readonly JumpBoardPoint[])[] = Object.freeze(
  Array.from({ length: 6 }, (_, campIndex) => convexHull(
    JUMP_CHESS_HOLES.filter((hole) => hole.campIndex === campIndex).map(pointFromHole),
  )),
)

export const JUMP_CHESS_CENTER_HEX: readonly JumpBoardPoint[] = convexHull(
  JUMP_CHESS_HOLES.filter((hole) => hole.campIndex === null).map(pointFromHole),
)

const centerTop = Math.min(...JUMP_CHESS_CENTER_HEX.map((point) => point.y))
const centerBottom = Math.max(...JUMP_CHESS_CENTER_HEX.map((point) => point.y))
const centerTopPoints = JUMP_CHESS_CENTER_HEX.filter((point) => point.y === centerTop)
const centerBottomPoints = JUMP_CHESS_CENTER_HEX.filter((point) => point.y === centerBottom)
const centerMiddle = (centerTop + centerBottom) / 2

export const JUMP_CHESS_STAR_OUTLINE: readonly JumpBoardPoint[] = Object.freeze([
  extreme(JUMP_CHESS_CAMP_TRIANGLES[0]!, (first, second) => first.y - second.y),
  extreme(centerTopPoints, (first, second) => second.x - first.x),
  extreme(JUMP_CHESS_CAMP_TRIANGLES[1]!, (first, second) => second.x - first.x),
  extreme(JUMP_CHESS_CENTER_HEX, (first, second) => second.x - first.x || Math.abs(first.y - centerMiddle) - Math.abs(second.y - centerMiddle)),
  extreme(JUMP_CHESS_CAMP_TRIANGLES[2]!, (first, second) => second.x - first.x),
  extreme(centerBottomPoints, (first, second) => second.x - first.x),
  extreme(JUMP_CHESS_CAMP_TRIANGLES[3]!, (first, second) => second.y - first.y),
  extreme(centerBottomPoints, (first, second) => first.x - second.x),
  extreme(JUMP_CHESS_CAMP_TRIANGLES[4]!, (first, second) => first.x - second.x),
  extreme(JUMP_CHESS_CENTER_HEX, (first, second) => first.x - second.x || Math.abs(first.y - centerMiddle) - Math.abs(second.y - centerMiddle)),
  extreme(JUMP_CHESS_CAMP_TRIANGLES[5]!, (first, second) => first.x - second.x),
  extreme(centerTopPoints, (first, second) => first.x - second.x),
])

const HOLE_BY_CELL = new Map(JUMP_CHESS_HOLES.map((hole) => [hole.cell, hole]))

function otherPlayer(player: JumpPlayer): JumpPlayer {
  return player === 'player1' ? 'player2' : 'player1'
}

function isPlayer(value: unknown): value is JumpPlayer {
  return value === 'player1' || value === 'player2'
}

function isCell(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && HOLE_BY_CELL.has(value)
}

function isMoveKind(value: unknown): value is JumpMoveKind {
  return value === 'step' || value === 'jump'
}

function isPhase(value: unknown): value is TurnGamePhase {
  return value === 'playing' || value === 'won' || value === 'draw'
}

function isDrawReason(value: unknown): value is JumpDrawReason | null {
  return value === null || value === 'mutual-no-moves' || value === 'threefold'
}

export function getJumpHole(cell: number): JumpHole | null {
  return HOLE_BY_CELL.get(cell) ?? null
}

export function getJumpCampOwner(cell: number): JumpPlayer | null {
  return getJumpHole(cell)?.campOwner ?? null
}

export function getJumpTargetCampOwner(player: JumpPlayer): JumpPlayer {
  return otherPlayer(player)
}

export function getJumpCampCells(owner: JumpPlayer): readonly number[] {
  return JUMP_CHESS_HOLES.filter((hole) => hole.campOwner === owner).map((hole) => hole.cell)
}

export function getJumpAdjacentCells(cell: number): readonly number[] {
  const hole = getJumpHole(cell)
  if (hole === null) return []
  return DIRECTIONS.flatMap((direction) => {
    const adjacent = HOLE_BY_KEY.get(coordinateKey({
      x: hole.x + direction[0],
      y: hole.y + direction[1],
      z: hole.z + direction[2],
    }))
    return adjacent === undefined ? [] : [adjacent.cell]
  })
}

function getJumpLandingCells(cell: number): readonly { readonly over: number; readonly landing: number }[] {
  const hole = getJumpHole(cell)
  if (hole === null) return []
  return DIRECTIONS.flatMap((direction) => {
    const over = HOLE_BY_KEY.get(coordinateKey({
      x: hole.x + direction[0],
      y: hole.y + direction[1],
      z: hole.z + direction[2],
    }))
    const landing = HOLE_BY_KEY.get(coordinateKey({
      x: hole.x + direction[0] * 2,
      y: hole.y + direction[1] * 2,
      z: hole.z + direction[2] * 2,
    }))
    return over === undefined || landing === undefined ? [] : [{ over: over.cell, landing: landing.cell }]
  })
}

function getPieceAt(state: Pick<JumpChessState, 'board' | 'pieces'>, cell: number): JumpPiece | null {
  const id = state.board[cell]
  return id === null || id === undefined ? null : state.pieces.find((piece) => piece.id === id) ?? null
}

export function getJumpPieceAt(state: Pick<JumpChessState, 'board' | 'pieces'>, cell: number): JumpPiece | null {
  return getPieceAt(state, cell)
}

function isLandingAllowed(piece: JumpPiece, landing: number): boolean {
  return !piece.enteredTargetCamp || getJumpCampOwner(landing) === getJumpTargetCampOwner(piece.owner)
}

function addStepMoves(state: JumpChessState, piece: JumpPiece, moves: JumpMove[]): void {
  for (const landing of getJumpAdjacentCells(piece.cell)) {
    if (state.board[landing] === null && isLandingAllowed(piece, landing)) {
      moves.push({ from: piece.cell, to: landing, kind: 'step' })
    }
  }
}

function addJumpMoves(state: JumpChessState, piece: JumpPiece, moves: JumpMove[]): void {
  for (const { over, landing } of getJumpLandingCells(piece.cell)) {
    if (state.board[over] !== null && state.board[landing] === null && isLandingAllowed(piece, landing)) {
      moves.push({ from: piece.cell, to: landing, kind: 'jump' })
    }
  }
}

function getJumpMovesForPiece(state: JumpChessState, piece: JumpPiece): readonly JumpMove[] {
  const moves: JumpMove[] = []
  addJumpMoves(state, piece, moves)
  return moves
}

export function getLegalJumpMoves(state: JumpChessState, player = state.currentPlayer): readonly JumpMove[] {
  if (state.phase !== 'playing' || player !== state.currentPlayer) return []
  if (state.activeJump !== null) {
    const piece = state.pieces.find((candidate) => candidate.id === state.activeJump?.pieceId)
    return piece === undefined ? [] : getJumpMovesForPiece(state, piece)
  }

  const moves: JumpMove[] = []
  for (const piece of state.pieces) {
    if (piece.owner !== player) continue
    addStepMoves(state, piece, moves)
    addJumpMoves(state, piece, moves)
  }
  return moves
}

export function getLegalJumpChessMoves(state: JumpChessState, player = state.currentPlayer): readonly JumpMove[] {
  return getLegalJumpMoves(state, player)
}

function boardFromPieces(pieces: readonly JumpPiece[]): readonly JumpCell[] {
  const board: JumpCell[] = Array.from({ length: JUMP_CHESS_BOARD_CELLS }, () => null)
  for (const piece of pieces) board[piece.cell] = piece.id
  return board
}

function positionSignature(board: readonly JumpCell[], currentPlayer: JumpPlayer): string {
  return `${currentPlayer}:${board.map((id) => id ?? '_').join(',')}`
}

function countOccurrences(values: readonly string[], target: string): number {
  return values.reduce((count, value) => count + (value === target ? 1 : 0), 0)
}

function createBaseState(
  pieces: readonly JumpPiece[],
  currentPlayer: JumpPlayer,
  seed: number,
): JumpChessState {
  const board = boardFromPieces(pieces)
  return {
    version: 1,
    boardSize: JUMP_CHESS_BOARD_CELLS,
    seed: seed >>> 0,
    startingPlayer: currentPlayer,
    initialPieces: pieces.map((piece) => ({ ...piece })),
    board,
    pieces,
    currentPlayer,
    phase: 'playing',
    winner: null,
    drawReason: null,
    turnCount: 0,
    consecutivePasses: 0,
    positionHistory: [positionSignature(board, currentPlayer)],
    turns: [],
    activeJump: null,
  }
}

export function createJumpChessStateFromPieces(
  placements: readonly JumpPiecePlacement[],
  currentPlayer: JumpPlayer = 'player1',
  seed = JUMP_CHESS_DEFAULT_SEED,
): JumpChessState {
  if (placements.length !== JUMP_CHESS_CAMP_SIZE * 2) {
    throw new Error('跳棋必須有雙方各 10 枚棋子。')
  }
  const cells = new Set<number>()
  const ids = new Set<string>()
  const ownerCounts: Record<JumpPlayer, number> = { player1: 0, player2: 0 }
  const pieces = placements.map((placement) => {
    if (!isPlayer(placement.owner) || !isCell(placement.cell) || cells.has(placement.cell)) {
      throw new Error('跳棋棋子位置或所屬不正確。')
    }
    const id = placement.id ?? `${placement.owner}-${ownerCounts[placement.owner] + 1}`
    if (ids.has(id)) throw new Error('跳棋棋子編號不可重複。')
    cells.add(placement.cell)
    ids.add(id)
    ownerCounts[placement.owner] += 1
    return {
      id,
      owner: placement.owner,
      cell: placement.cell,
      enteredTargetCamp: placement.enteredTargetCamp ?? getJumpCampOwner(placement.cell) === getJumpTargetCampOwner(placement.owner),
    } satisfies JumpPiece
  })
  if (ownerCounts.player1 !== JUMP_CHESS_CAMP_SIZE || ownerCounts.player2 !== JUMP_CHESS_CAMP_SIZE) {
    throw new Error('跳棋必須有雙方各 10 枚棋子。')
  }
  return createBaseState(pieces, currentPlayer, seed)
}

function createInitialPlacements(): readonly JumpPiecePlacement[] {
  return (['player1', 'player2'] as const).flatMap((owner) => getJumpCampCells(owner).map((cell, index) => ({
    owner,
    cell,
    id: `${owner}-${index + 1}`,
  })))
}

export function createJumpChessState(seed = JUMP_CHESS_DEFAULT_SEED): JumpChessState {
  return createJumpChessStateFromPieces(createInitialPlacements(), 'player1', seed)
}

interface JumpTutorialJump {
  readonly from: number
  readonly over: number
  readonly to: number
}

interface JumpTutorialScenario {
  readonly state: JumpChessState
  readonly moves: readonly JumpMove[]
}

function tutorialLanding(from: number, over: number): number | null {
  const fromHole = getJumpHole(from)
  const overHole = getJumpHole(over)
  if (fromHole === null || overHole === null) return null
  return JUMP_CHESS_HOLES.find((hole) =>
    hole.x === fromHole.x + 2 * (overHole.x - fromHole.x) &&
    hole.y === fromHole.y + 2 * (overHole.y - fromHole.y) &&
    hole.z === fromHole.z + 2 * (overHole.z - fromHole.z),
  )?.cell ?? null
}

function findTutorialStep(): JumpMove {
  for (const from of getJumpCampCells('player1')) {
    const to = getJumpAdjacentCells(from).find((candidate) => getJumpCampOwner(candidate) === null)
    if (to !== undefined) return { from, to, kind: 'step' }
  }
  throw new Error('找不到跳棋教學的一格移動局面。')
}

function findTutorialJump(excludedSources: readonly number[] = []): JumpTutorialJump {
  for (const fromHole of JUMP_CHESS_HOLES) {
    if (fromHole.campOwner !== null) continue
    if (excludedSources.includes(fromHole.cell)) continue
    for (const over of getJumpAdjacentCells(fromHole.cell)) {
      if (getJumpCampOwner(over) !== null) continue
      const to = tutorialLanding(fromHole.cell, over)
      if (to !== null && getJumpCampOwner(to) === null) return { from: fromHole.cell, over, to }
    }
  }
  throw new Error('找不到跳棋教學的跳躍局面。')
}

function findTutorialDoubleJump(): readonly [JumpTutorialJump, JumpTutorialJump] {
  for (const firstFromHole of JUMP_CHESS_HOLES) {
    if (firstFromHole.campOwner !== null) continue
    for (const firstOver of getJumpAdjacentCells(firstFromHole.cell)) {
      if (getJumpCampOwner(firstOver) !== null) continue
      const firstTo = tutorialLanding(firstFromHole.cell, firstOver)
      if (firstTo === null || getJumpCampOwner(firstTo) !== null) continue
      for (const secondOver of getJumpAdjacentCells(firstTo)) {
        if (secondOver === firstFromHole.cell || secondOver === firstOver || getJumpCampOwner(secondOver) !== null) continue
        const secondTo = tutorialLanding(firstTo, secondOver)
        if (secondTo === null || secondTo === firstFromHole.cell || secondTo === firstOver || getJumpCampOwner(secondTo) !== null) continue
        return [
          { from: firstFromHole.cell, over: firstOver, to: firstTo },
          { from: firstTo, over: secondOver, to: secondTo },
        ]
      }
    }
  }
  throw new Error('找不到跳棋教學的連續跳躍局面。')
}

function findTutorialWinMove(): JumpMove & { readonly targetCamp: readonly number[]; readonly source: number } {
  const targetCamp = getJumpCampCells('player2')
  for (const to of targetCamp) {
    const from = getJumpAdjacentCells(to).find((candidate) => getJumpCampOwner(candidate) === null)
    if (from !== undefined) return { from, to, kind: 'step', targetCamp, source: from }
  }
  throw new Error('找不到跳棋教學的勝利局面。')
}

function fillTutorialPlacements(
  required: readonly JumpPiecePlacement[],
  reserved: readonly number[] = [],
): readonly JumpPiecePlacement[] {
  const placements = [...required]
  const used = new Set(placements.map((piece) => piece.cell))
  const reservedCells = new Set(reserved)
  const fillers = JUMP_CHESS_HOLES
    .filter((hole) => hole.campOwner === null && !used.has(hole.cell) && !reservedCells.has(hole.cell))
    .map((hole) => hole.cell)
  let fillerIndex = 0
  for (const owner of ['player1', 'player2'] as const) {
    while (placements.filter((piece) => piece.owner === owner).length < JUMP_CHESS_CAMP_SIZE) {
      const cell = fillers[fillerIndex++]
      if (cell === undefined) throw new Error('跳棋教學局面沒有足夠的填充棋孔。')
      placements.push({ owner, cell, id: `tutorial-${owner}-${placements.length + 1}` })
      used.add(cell)
    }
  }
  return placements
}

function createTutorialScenarios(): readonly JumpTutorialScenario[] {
  const step = findTutorialStep()
  const basicJump = findTutorialJump()
  const ownJump = findTutorialJump([basicJump.from])
  const opponentJump = findTutorialJump([basicJump.from, ownJump.from])
  const [firstChainJump, secondChainJump] = findTutorialDoubleJump()
  const win = findTutorialWinMove()

  return Object.freeze([
    {
      state: createJumpChessStateFromPieces(fillTutorialPlacements([
        { owner: 'player1', cell: step.from },
      ], [step.to])),
      moves: [step],
    },
    {
      state: createJumpChessStateFromPieces(fillTutorialPlacements([
        { owner: 'player1', cell: basicJump.from },
        { owner: 'player2', cell: basicJump.over },
      ], [basicJump.to])),
      moves: [{ from: basicJump.from, to: basicJump.to, kind: 'jump' }],
    },
    {
      state: createJumpChessStateFromPieces(fillTutorialPlacements([
        { owner: 'player1', cell: ownJump.from },
        { owner: 'player1', cell: ownJump.over },
      ], [ownJump.to])),
      moves: [{ from: ownJump.from, to: ownJump.to, kind: 'jump' }],
    },
    {
      state: createJumpChessStateFromPieces(fillTutorialPlacements([
        { owner: 'player1', cell: opponentJump.from },
        { owner: 'player2', cell: opponentJump.over },
      ], [opponentJump.to])),
      moves: [{ from: opponentJump.from, to: opponentJump.to, kind: 'jump' }],
    },
    {
      state: createJumpChessStateFromPieces(fillTutorialPlacements([
        { owner: 'player1', cell: firstChainJump.from },
        { owner: 'player2', cell: firstChainJump.over },
        { owner: 'player2', cell: secondChainJump.over },
      ], [firstChainJump.to, secondChainJump.to])),
      moves: [
        { from: firstChainJump.from, to: firstChainJump.to, kind: 'jump' },
        { from: secondChainJump.from, to: secondChainJump.to, kind: 'jump' },
      ],
    },
    {
      state: createJumpChessStateFromPieces([
        ...win.targetCamp.filter((cell) => cell !== win.to).map((cell, index) => ({ owner: 'player1' as const, cell, id: `tutorial-player1-target-${index + 1}`, enteredTargetCamp: true })),
        { owner: 'player1', cell: win.source, id: 'tutorial-player1-last' },
        ...getJumpCampCells('player1').map((cell, index) => ({ owner: 'player2' as const, cell, id: `tutorial-player2-home-${index + 1}` })),
      ]),
      moves: [{ from: win.from, to: win.to, kind: 'step' }],
    },
  ])
}

const JUMP_CHESS_TUTORIAL_SCENARIOS = createTutorialScenarios()

export function createJumpChessTutorialState(step = 0): JumpChessState {
  const boundedStep = Math.max(0, Math.min(JUMP_CHESS_TUTORIAL_COUNT - 1, step))
  return JUMP_CHESS_TUTORIAL_SCENARIOS[boundedStep]!.state
}

export function getJumpChessTutorialMoves(step = 0): readonly JumpMove[] {
  const boundedStep = Math.max(0, Math.min(JUMP_CHESS_TUTORIAL_COUNT - 1, step))
  return JUMP_CHESS_TUTORIAL_SCENARIOS[boundedStep]!.moves
}

function updatePieceCell(pieces: readonly JumpPiece[], pieceId: string, cell: number): readonly JumpPiece[] {
  return pieces.map((piece) => piece.id === pieceId
    ? {
      ...piece,
      cell,
      enteredTargetCamp: piece.enteredTargetCamp || getJumpCampOwner(cell) === getJumpTargetCampOwner(piece.owner),
    }
    : piece)
}

function winnerForPieces(pieces: readonly JumpPiece[], player: JumpPlayer): JumpPlayer | null {
  return pieces.filter((piece) => piece.owner === player && piece.enteredTargetCamp).length === JUMP_CHESS_CAMP_SIZE
    ? player
    : null
}

function completeTurn(
  state: JumpChessState,
  board: readonly JumpCell[],
  pieces: readonly JumpPiece[],
  record: JumpTurnRecord,
  winnerOverride: JumpPlayer | null = null,
): JumpChessState {
  const currentPlayer = otherPlayer(state.currentPlayer)
  const turnCount = state.turnCount + 1
  const positionHistory = [...state.positionHistory, positionSignature(board, currentPlayer)]
  const winner = winnerOverride ?? winnerForPieces(pieces, state.currentPlayer)
  const repeated = countOccurrences(positionHistory, positionHistory[positionHistory.length - 1]!) >= 3
  const drawReason: JumpDrawReason | null = winner !== null
    ? null
    : repeated
      ? 'threefold'
      : null
  const phase: TurnGamePhase = winner !== null ? 'won' : drawReason === null ? 'playing' : 'draw'

  return {
    ...state,
    board,
    pieces,
    currentPlayer,
    phase,
    winner,
    drawReason,
    turnCount,
    consecutivePasses: 0,
    positionHistory,
    turns: [...state.turns, record],
    activeJump: null,
  }
}

export function resolveJumpForcedPasses(state: JumpChessState): JumpChessState {
  let next = state
  while (next.phase === 'playing' && next.activeJump === null && getLegalJumpMoves(next).length === 0) {
    const currentPlayer = next.currentPlayer
    const nextPlayer = otherPlayer(currentPlayer)
    const turnCount = next.turnCount + 1
    const consecutivePasses = next.consecutivePasses + 1
    const positionHistory = [...next.positionHistory, positionSignature(next.board, nextPlayer)]
    const repeated = countOccurrences(positionHistory, positionHistory[positionHistory.length - 1]!) >= 3
    const drawReason: JumpDrawReason | null = consecutivePasses >= 2
      ? 'mutual-no-moves'
      : repeated
        ? 'threefold'
        : null
    next = {
      ...next,
      currentPlayer: nextPlayer,
      phase: drawReason === null ? 'playing' : 'draw',
      winner: null,
      drawReason,
      turnCount,
      consecutivePasses,
      positionHistory,
      turns: [...next.turns, { kind: 'pass', player: currentPlayer }],
    }
  }
  return next
}

export function applyJumpChessMove(state: JumpChessState, move: JumpMove): JumpChessState {
  if (state.phase !== 'playing') throw new Error('這一局已經結束。')
  if (!isCell(move.from) || !isCell(move.to) || !isMoveKind(move.kind)) throw new Error('這一步不在跳棋棋盤裡。')

  const legalMove = getLegalJumpMoves(state).find((candidate) => candidate.from === move.from && candidate.to === move.to && candidate.kind === move.kind)
  if (legalMove === undefined) throw new Error('這一步不是跳棋的合法走法。')
  const moving = getPieceAt(state, move.from)
  if (moving === null) throw new Error('找不到要移動的跳棋棋子。')

  const pieces = updatePieceCell(state.pieces, moving.id, move.to)
  const board = boardFromPieces(pieces)
  if (move.kind === 'step') {
    const next = completeTurn(state, board, pieces, {
      kind: 'move',
      player: state.currentPlayer,
      moveKind: 'step',
      path: [move.from, move.to],
    })
    return next.phase === 'playing' ? resolveJumpForcedPasses(next) : next
  }

  const activeJump: JumpActiveSequence = state.activeJump === null
    ? { player: state.currentPlayer, pieceId: moving.id, origin: move.from, path: [move.from, move.to] }
    : { ...state.activeJump, path: [...state.activeJump.path, move.to] }
  const jumpingState: JumpChessState = { ...state, board, pieces, activeJump }
  const winner = winnerForPieces(pieces, moving.owner)
  if (winner !== null) {
    return completeTurn(jumpingState, board, pieces, {
      kind: 'move',
      player: moving.owner,
      moveKind: 'jump',
      path: activeJump.path,
    }, winner)
  }
  return jumpingState
}

export function finishJumpChessTurn(state: JumpChessState): JumpChessState {
  if (state.phase !== 'playing') throw new Error('這一局已經結束。')
  if (state.activeJump === null || state.activeJump.path.length < 2) throw new Error('目前沒有可以結束的跳躍回合。')
  const next = completeTurn(state, state.board, state.pieces, {
    kind: 'move',
    player: state.activeJump.player,
    moveKind: 'jump',
    path: state.activeJump.path,
  })
  return next.phase === 'playing' ? resolveJumpForcedPasses(next) : next
}

function isJumpMoveRecord(value: unknown): value is JumpMoveTurnRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.kind === 'move' && isPlayer(record.player) && isMoveKind(record.moveKind) &&
    Array.isArray(record.path) && record.path.length >= 2 && record.path.every(isCell) &&
    (record.moveKind === 'step' ? record.path.length === 2 : true)
}

function isJumpPassRecord(value: unknown): value is JumpPassTurnRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.kind === 'pass' && isPlayer(record.player)
}

function isJumpTurnRecord(value: unknown): value is JumpTurnRecord {
  return isJumpMoveRecord(value) || isJumpPassRecord(value)
}

function sameTurns(left: readonly JumpTurnRecord[], right: readonly JumpTurnRecord[]): boolean {
  return left.length === right.length && left.every((record, index) => {
    const candidate = right[index]
    if (candidate === undefined || record.kind !== candidate.kind || record.player !== candidate.player) return false
    if (record.kind === 'pass' || candidate.kind !== 'move') return record.kind === candidate.kind
    return record.moveKind === candidate.moveKind && record.path.length === candidate.path.length &&
      record.path.every((cell, pathIndex) => cell === candidate.path[pathIndex])
  })
}

function stateSnapshot(state: JumpChessState): unknown {
  return {
    version: state.version,
    boardSize: state.boardSize,
    seed: state.seed,
    startingPlayer: state.startingPlayer,
    initialPieces: state.initialPieces,
    board: state.board,
    pieces: state.pieces,
    currentPlayer: state.currentPlayer,
    phase: state.phase,
    winner: state.winner,
    drawReason: state.drawReason,
    turnCount: state.turnCount,
    consecutivePasses: state.consecutivePasses,
    positionHistory: state.positionHistory,
    turns: state.turns,
    activeJump: state.activeJump,
  }
}

function validatePiece(value: unknown): value is JumpPiece {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const piece = value as Record<string, unknown>
  return typeof piece.id === 'string' && piece.id.length > 0 && isPlayer(piece.owner) && isCell(piece.cell) &&
    typeof piece.enteredTargetCamp === 'boolean'
}

function validateState(value: unknown): value is JumpChessState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || candidate.boardSize !== JUMP_CHESS_BOARD_CELLS ||
    typeof candidate.seed !== 'number' || !Number.isInteger(candidate.seed) || !isPlayer(candidate.startingPlayer) || !isPlayer(candidate.currentPlayer) ||
    !isPhase(candidate.phase) || (candidate.winner !== null && !isPlayer(candidate.winner)) ||
    !isDrawReason(candidate.drawReason) || typeof candidate.turnCount !== 'number' || !Number.isInteger(candidate.turnCount) ||
    candidate.turnCount < 0 ||
    typeof candidate.consecutivePasses !== 'number' || !Number.isInteger(candidate.consecutivePasses) || candidate.consecutivePasses < 0 ||
    !Array.isArray(candidate.board) || candidate.board.length !== JUMP_CHESS_BOARD_CELLS ||
    !candidate.board.every((cell) => cell === null || typeof cell === 'string') ||
    !Array.isArray(candidate.initialPieces) || candidate.initialPieces.length !== JUMP_CHESS_CAMP_SIZE * 2 || !candidate.initialPieces.every(validatePiece) ||
    !Array.isArray(candidate.pieces) || candidate.pieces.length !== JUMP_CHESS_CAMP_SIZE * 2 || !candidate.pieces.every(validatePiece) ||
    !Array.isArray(candidate.positionHistory) || candidate.positionHistory.length !== candidate.turnCount + 1 ||
    !candidate.positionHistory.every((entry) => typeof entry === 'string') ||
    !Array.isArray(candidate.turns) || candidate.turns.length !== candidate.turnCount || !candidate.turns.every(isJumpTurnRecord)) return false

  const initialPieces = candidate.initialPieces
  const initialIds = new Set(initialPieces.map((piece) => piece.id))
  const initialCells = new Set(initialPieces.map((piece) => piece.cell))
  if (initialIds.size !== initialPieces.length || initialCells.size !== initialPieces.length) return false

  const pieces = candidate.pieces
  const ids = new Set(pieces.map((piece) => piece.id))
  const cells = new Set(pieces.map((piece) => piece.cell))
  if (ids.size !== pieces.length || cells.size !== pieces.length) return false
  const board = candidate.board as readonly JumpCell[]
  if (board.some((id, cell) => id !== null && (!ids.has(id) || pieces.find((piece) => piece.id === id)?.cell !== cell))) return false
  if (pieces.some((piece) => board[piece.cell] !== piece.id)) return false

  const active = candidate.activeJump
  if (active !== null) {
    if (typeof active !== 'object' || Array.isArray(active)) return false
    const sequence = active as Record<string, unknown>
    if (!isPlayer(sequence.player) || sequence.player !== candidate.currentPlayer || typeof sequence.pieceId !== 'string' ||
      !isCell(sequence.origin) || !Array.isArray(sequence.path) || sequence.path.length < 2 || !sequence.path.every(isCell) ||
      sequence.path[0] !== sequence.origin) return false
    const piece = pieces.find((candidatePiece) => candidatePiece.id === sequence.pieceId)
    if (piece === undefined || piece.owner !== sequence.player || sequence.path[sequence.path.length - 1] !== piece.cell) return false
  }
  return true
}

export function serializeJumpChessState(state: JumpChessState): string {
  return JSON.stringify(stateSnapshot(state))
}

export function replayJumpChessTurns(turns: readonly JumpTurnRecord[], initialState = createJumpChessState()): JumpChessState {
  if (!turns.every(isJumpTurnRecord)) throw new Error('跳棋回合紀錄格式不正確。')
  let state = initialState
  for (const record of turns.filter((candidate): candidate is JumpMoveTurnRecord => candidate.kind === 'move')) {
    if (record.player !== state.currentPlayer) throw new Error('跳棋回合順序不一致。')
    if (record.moveKind === 'step') {
      state = applyJumpChessMove(state, { from: record.path[0]!, to: record.path[1]!, kind: 'step' })
      continue
    }
    state = applyJumpChessMove(state, { from: record.path[0]!, to: record.path[1]!, kind: 'jump' })
    for (let index = 2; index < record.path.length; index += 1) {
      state = applyJumpChessMove(state, { from: record.path[index - 1]!, to: record.path[index]!, kind: 'jump' })
    }
    state = finishJumpChessTurn(state)
  }
  if (!sameTurns(state.turns, turns)) throw new Error('跳棋回合紀錄與規則不一致。')
  return state
}

export function deserializeJumpChessState(serialized: string): JumpChessState {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('跳棋存檔不是有效的 JSON。')
  }
  if (!validateState(parsed)) throw new Error('跳棋存檔格式不正確。')

  let replayed: JumpChessState
  try {
    const initialState = createBaseState(parsed.initialPieces, parsed.startingPlayer, parsed.seed)
    replayed = replayJumpChessTurns(parsed.turns, initialState)
    if (parsed.activeJump !== null) {
      for (let index = 1; index < parsed.activeJump.path.length; index += 1) {
        replayed = applyJumpChessMove(replayed, {
          from: parsed.activeJump.path[index - 1]!,
          to: parsed.activeJump.path[index]!,
          kind: 'jump',
        })
      }
    }
  } catch {
    throw new Error('跳棋回合紀錄包含不合法步驟。')
  }
  if (JSON.stringify(stateSnapshot(replayed)) !== JSON.stringify(stateSnapshot(parsed))) {
    throw new Error('跳棋存檔內容與回合紀錄不一致。')
  }
  return replayed
}

export const jumpChessRules: TurnGameRules<JumpChessState, JumpMove> = {
  createInitialState: createJumpChessState,
  getLegalMoves: getLegalJumpMoves,
  applyMove: applyJumpChessMove,
  serialize: serializeJumpChessState,
  deserialize: deserializeJumpChessState,
}
