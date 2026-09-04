import { describe, expect, it } from 'vitest'
import {
  JUMP_CHESS_BOARD_CELLS,
  JUMP_CHESS_CAMP_SIZE,
  JUMP_CHESS_CAMP_TRIANGLES,
  JUMP_CHESS_CENTER_HEX,
  JUMP_CHESS_HOLES,
  JUMP_CHESS_LAYOUT_HEIGHT,
  JUMP_CHESS_LAYOUT_WIDTH,
  JUMP_CHESS_STANDARD_ROW_LENGTHS,
  JUMP_CHESS_STAR_OUTLINE,
  applyJumpChessMove,
  createJumpChessState,
  createJumpChessStateFromPieces,
  createJumpChessTutorialState,
  deserializeJumpChessState,
  finishJumpChessTurn,
  getJumpAdjacentCells,
  getJumpCampCells,
  getJumpCampOwner,
  getJumpChessTutorialMoves,
  getJumpHole,
  getJumpPieceAt,
  getJumpTargetCampOwner,
  getLegalJumpMoves,
  replayJumpChessTurns,
  resolveJumpForcedPasses,
  serializeJumpChessState,
  type JumpChessState,
  type JumpMove,
  type JumpPiecePlacement,
  type JumpPlayer,
} from './rules'

const placement = (owner: JumpPlayer, cell: number, index: number): JumpPiecePlacement => ({
  owner,
  cell,
  id: `${owner}-test-${index}`,
})

function customState(
  active: readonly { owner: JumpPlayer; cell: number }[],
  currentPlayer: JumpPlayer = 'player1',
  reserved: readonly number[] = [],
): JumpChessState {
  const used = new Set(active.map((piece) => piece.cell))
  const reservedCells = new Set(reserved)
  const spareCells = JUMP_CHESS_HOLES.map((hole) => hole.cell).filter((cell) => !used.has(cell) && !reservedCells.has(cell) && getJumpCampOwner(cell) === null)
  let spareIndex = 0
  const placements: JumpPiecePlacement[] = [...active.map((piece, index) => placement(piece.owner, piece.cell, index))]
  for (const owner of ['player1', 'player2'] as const) {
    while (placements.filter((piece) => piece.owner === owner).length < JUMP_CHESS_CAMP_SIZE) {
      const cell = spareCells[spareIndex++]!
      placements.push(placement(owner, cell, placements.length))
    }
  }
  return createJumpChessStateFromPieces(placements, currentPlayer)
}

function move(state: JumpChessState, from: number, to: number, kind: 'step' | 'jump'): JumpChessState {
  return applyJumpChessMove(state, { from, to, kind })
}

function findJumpTriple(start: number): readonly [number, number] {
  const startHole = getJumpHole(start)!
  for (const over of getJumpAdjacentCells(start)) {
    const overHole = getJumpHole(over)!
    const landingHole = JUMP_CHESS_HOLES.find((hole) =>
      hole.x === startHole.x + 2 * (overHole.x - startHole.x) &&
      hole.y === startHole.y + 2 * (overHole.y - startHole.y) &&
      hole.z === startHole.z + 2 * (overHole.z - startHole.z))
    if (landingHole !== undefined) return [over, landingHole.cell]
  }
  throw new Error('找不到測試用的跳躍三連孔。')
}

describe('跳棋 V130-ENGINE 規則核心', () => {
  it('建立標準 121 孔、六方向與雙方各 10 枚棋子', () => {
    const state = createJumpChessState()
    expect(JUMP_CHESS_HOLES).toHaveLength(JUMP_CHESS_BOARD_CELLS)
    expect(new Set(JUMP_CHESS_HOLES.map((hole) => `${hole.x},${hole.y},${hole.z}`)).size).toBe(JUMP_CHESS_BOARD_CELLS)
    expect(getJumpCampCells('player1')).toHaveLength(JUMP_CHESS_CAMP_SIZE)
    expect(getJumpCampCells('player2')).toHaveLength(JUMP_CHESS_CAMP_SIZE)
    expect(Math.min(...getJumpCampCells('player1').map((cell) => getJumpHole(cell)!.layoutY))).toBeGreaterThan(
      Math.max(...getJumpCampCells('player2').map((cell) => getJumpHole(cell)!.layoutY)),
    )
    expect(state.pieces.filter((piece) => piece.owner === 'player1')).toHaveLength(JUMP_CHESS_CAMP_SIZE)
    expect(state.pieces.filter((piece) => piece.owner === 'player2')).toHaveLength(JUMP_CHESS_CAMP_SIZE)
    expect(getJumpTargetCampOwner('player1')).toBe('player2')
    expect(getJumpTargetCampOwner('player2')).toBe('player1')
  })

  it('六方向相鄰關係對稱且不把棋孔當成方格矩形', () => {
    for (const hole of JUMP_CHESS_HOLES) {
      for (const adjacent of getJumpAdjacentCells(hole.cell)) {
        expect(getJumpAdjacentCells(adjacent)).toContain(hole.cell)
      }
    }
    expect(getJumpHole(0)).not.toBeNull()
    expect(getJumpCampOwner(getJumpCampCells('player1')[0]!)).toBe('player1')
  })

  it('平面投影依正式 17 列孔數建立直向六角星形', () => {
    const positions = new Set(JUMP_CHESS_HOLES.map((hole) => `${hole.layoutX.toFixed(4)},${hole.layoutY.toFixed(4)}`))
    expect(positions).toHaveLength(JUMP_CHESS_BOARD_CELLS)
    const rowLengths = Array.from({ length: 17 }, (_, rowIndex) => JUMP_CHESS_HOLES.filter((hole) => hole.z === rowIndex - 8).length)
    expect(rowLengths).toEqual(JUMP_CHESS_STANDARD_ROW_LENGTHS)
    expect(JUMP_CHESS_LAYOUT_WIDTH / JUMP_CHESS_LAYOUT_HEIGHT).toBeGreaterThan(0.84)
    expect(JUMP_CHESS_LAYOUT_WIDTH / JUMP_CHESS_LAYOUT_HEIGHT).toBeLessThan(0.92)
    expect(JUMP_CHESS_CAMP_TRIANGLES).toHaveLength(6)
    expect(JUMP_CHESS_CAMP_TRIANGLES.every((triangle) => triangle.length === 3)).toBe(true)
    expect(JUMP_CHESS_CENTER_HEX).toHaveLength(6)
    expect(JUMP_CHESS_STAR_OUTLINE).toHaveLength(12)
    for (const point of [...JUMP_CHESS_CENTER_HEX, ...JUMP_CHESS_CAMP_TRIANGLES.flat()]) {
      expect(JUMP_CHESS_HOLES.some((hole) => hole.layoutX === point.x && hole.layoutY === point.y)).toBe(true)
    }
  })

  it('一般移動只能相鄰一格，且不能與跳躍混用', () => {
    const state = customState([
      { owner: 'player1', cell: 60 },
      { owner: 'player2', cell: 61 },
    ])
    const steps = getLegalJumpMoves(state).filter((candidate) => candidate.kind === 'step' && candidate.from === 60)
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.every((candidate) => getJumpAdjacentCells(candidate.from).includes(candidate.to))).toBe(true)
    expect(() => move(state, 60, 62, 'step')).toThrow('合法走法')
    const moved = move(state, steps[0]!.from, steps[0]!.to, 'step')
    expect(moved.turnCount).toBe(1)
    expect(moved.currentPlayer).toBe('player2')
    expect(moved.activeJump).toBeNull()
  })

  it('跳躍必須跳過相鄰有棋子的棋孔且不吃子，可連跳並回到原位', () => {
    const start = 60
    const [over, landing] = findJumpTriple(start)
    const state = customState([
      { owner: 'player1', cell: start },
      { owner: 'player2', cell: over },
    ], 'player1', [landing])
    const jump = getLegalJumpMoves(state).find((candidate) => candidate.kind === 'jump' && candidate.from === start)
    expect(jump).toBeDefined()
    const afterFirst = move(state, jump!.from, jump!.to, 'jump')
    expect(afterFirst.activeJump?.path).toEqual([jump!.from, jump!.to])
    expect(afterFirst.pieces.find((piece) => piece.owner === 'player2' && piece.cell === over)?.cell).toBe(over)
    const back = getLegalJumpMoves(afterFirst).find((candidate) => candidate.kind === 'jump' && candidate.to === start)
    expect(back).toBeDefined()
    const afterBack = move(afterFirst, back!.from, back!.to, 'jump')
    expect(afterBack.activeJump?.path).toEqual([start, jump!.to, start])
    const ended = finishJumpChessTurn(afterBack)
    expect(ended.turnCount).toBe(1)
    expect(ended.currentPlayer).toBe('player2')
    expect(getJumpPieceAt(ended, start)?.owner).toBe('player1')
  })

  it('跳躍不能離開已進入的目標營陣，誤選其他棋子不會改變引擎的選中序列', () => {
    const targetCells = getJumpCampCells('player2')
    const start = targetCells.find((cell) => {
      const neighbours = getJumpAdjacentCells(cell)
      return neighbours.some((candidate) => getJumpCampOwner(candidate) === 'player2') &&
        neighbours.some((candidate) => getJumpCampOwner(candidate) !== 'player2')
    })!
    const nearby = getJumpAdjacentCells(start).find((cell) => getJumpCampOwner(cell) === 'player2')
    expect(nearby).toBeDefined()
    const over = getJumpAdjacentCells(start).find((cell) => cell !== nearby && getJumpCampOwner(cell) !== 'player2')
    expect(over).toBeDefined()
    const state = customState([
      { owner: 'player1', cell: start },
      { owner: 'player2', cell: nearby! },
    ])
    const entered = { ...state, pieces: state.pieces.map((piece) => piece.cell === start ? { ...piece, enteredTargetCamp: true } : piece) }
    const board = entered.pieces.reduce((cells, piece) => { cells[piece.cell] = piece.id; return cells }, Array.from({ length: JUMP_CHESS_BOARD_CELLS }, () => null as string | null))
    const locked = { ...entered, board }
    expect(getLegalJumpMoves(locked).filter((candidate) => candidate.from === start).every((candidate) => getJumpCampOwner(candidate.to) === 'player2')).toBe(true)
    expect(() => move(locked, start, over!, 'step')).toThrow('合法走法')
  })

  it('第 10 枚進入對面營陣立即獲勝', () => {
    const target = getJumpCampCells('player2')
    const winningTarget = target.find((cell) => getJumpAdjacentCells(cell).some((candidate) => getJumpCampOwner(candidate) === null))!
    const source = getJumpAdjacentCells(winningTarget).find((cell) => getJumpCampOwner(cell) === null)!
    const active: Array<{ owner: JumpPlayer; cell: number }> = target.filter((cell) => cell !== winningTarget).map((cell) => ({ owner: 'player1', cell }))
    active.push({ owner: 'player1', cell: source }, { owner: 'player2', cell: getJumpCampCells('player1')[0]! })
    const state = customState(active)
    const board = state.pieces.reduce((cells, piece) => { cells[piece.cell] = piece.id; return cells }, Array.from({ length: JUMP_CHESS_BOARD_CELLS }, () => null as string | null))
    const consistent: JumpChessState = { ...state, board }
    const winningMove = getLegalJumpMoves(consistent).find((candidate) => candidate.from === source && candidate.to === winningTarget)
    expect(winningMove).toBeDefined()
    const won = move(consistent, winningMove!.from, winningMove!.to, winningMove!.kind)
    expect(won.phase).toBe('won')
    expect(won.winner).toBe('player1')
    expect(won.drawReason).toBeNull()
  })

  it('無法行動自動換手，雙方連續無法行動判和，且自動跳過各計一次', () => {
    const player1Camp = getJumpCampCells('player1')
    const player2Camp = getJumpCampCells('player2')
    const placements = [
      ...player1Camp.map((cell, index) => placement('player2', cell, index)),
      ...player2Camp.map((cell, index) => placement('player1', cell, index + 10)),
    ]
    const state = createJumpChessStateFromPieces(placements)
    const resolved = resolveJumpForcedPasses(state)
    expect(resolved.phase).toBe('draw')
    expect(resolved.drawReason).toBe('mutual-no-moves')
    expect(resolved.turnCount).toBe(2)
    expect(resolved.turns).toEqual([
      { kind: 'pass', player: 'player1' },
      { kind: 'pass', player: 'player2' },
    ])
  })

  it('沒有人工回合上限，且三次完整局面會和局', () => {
    let state = createJumpChessState()
    let cycle: readonly JumpMove[] | null = null
    for (const firstStep of getLegalJumpMoves(state).filter((candidate) => candidate.kind === 'step')) {
      const afterFirst = move(state, firstStep.from, firstStep.to, firstStep.kind)
      for (const secondStep of getLegalJumpMoves(afterFirst).filter((candidate) => candidate.kind === 'step')) {
        if (secondStep.to === firstStep.from) continue
        const afterSecond = move(afterFirst, secondStep.from, secondStep.to, secondStep.kind)
        const returnOne = getLegalJumpMoves(afterSecond).find((candidate) => candidate.kind === 'step' && candidate.from === firstStep.to && candidate.to === firstStep.from)
        if (returnOne === undefined) continue
        const afterReturnOne = move(afterSecond, returnOne.from, returnOne.to, returnOne.kind)
        const returnTwo = getLegalJumpMoves(afterReturnOne).find((candidate) => candidate.kind === 'step' && candidate.from === secondStep.to && candidate.to === secondStep.from)
        if (returnTwo !== undefined) {
          cycle = [firstStep, secondStep, returnOne, returnTwo]
          break
        }
      }
      if (cycle !== null) break
    }
    expect(cycle).not.toBeNull()
    for (let repetition = 0; repetition < 2; repetition += 1) {
      for (const turn of cycle!) state = move(state, turn.from, turn.to, turn.kind)
    }
    expect(state.phase).toBe('draw')
    expect(state.drawReason).toBe('threefold')
  })

  it('完成回合與連跳中的局面都能序列化、重播，並拒絕竄改', () => {
    const initial = createJumpChessState()
    const step = getLegalJumpMoves(initial).find((candidate) => candidate.kind === 'step')!
    const afterStep = move(initial, step.from, step.to, step.kind)
    expect(deserializeJumpChessState(serializeJumpChessState(afterStep))).toEqual(afterStep)

    const start = 60
    const [over, landing] = findJumpTriple(start)
    const custom = customState([
      { owner: 'player1', cell: start },
      { owner: 'player2', cell: over },
    ], 'player1', [landing])
    const jumping = move(custom, start, landing, 'jump')
    expect(deserializeJumpChessState(serializeJumpChessState(jumping))).toEqual(jumping)
    expect(() => deserializeJumpChessState(serializeJumpChessState(afterStep).replace('"turnCount":1', '"turnCount":2'))).toThrow(/格式|內容/)
    expect(replayJumpChessTurns(afterStep.turns)).toEqual(afterStep)
  })

  it('六關教學都使用真實合法棋步，連跳關卡保留同一回合的連續跳躍', () => {
    for (let step = 0; step < 6; step += 1) {
      const tutorialState = createJumpChessTutorialState(step)
      const tutorialMoves = getJumpChessTutorialMoves(step)
      let state = tutorialState
      for (const tutorialMove of tutorialMoves) {
        expect(getLegalJumpMoves(state)).toContainEqual(tutorialMove)
        state = move(state, tutorialMove.from, tutorialMove.to, tutorialMove.kind)
      }
      if (state.activeJump !== null) state = finishJumpChessTurn(state)
      expect(state.turns).toHaveLength(1)
      if (step === 4) expect(state.turns[0]).toMatchObject({ moveKind: 'jump', path: expect.arrayContaining(tutorialMoves.map((moveItem) => moveItem.from)) })
    }
  })

  it('第二至第四關使用不同的起始棋孔，避免兒童依相同步驟盲點同一位置', () => {
    const sources = [1, 2, 3].map((step) => getJumpChessTutorialMoves(step)[0]!.from)
    expect(new Set(sources).size).toBe(3)
  })
})
