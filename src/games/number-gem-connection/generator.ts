import type { DifficultyLevel } from '../../components/common-ui'
import type { NumberGemBoardSize, NumberGemPuzzle, NumberGemPuzzleType } from './rules'

export type NumberGemDifficulty = DifficultyLevel

interface GeneratorConfig {
  boardSize: NumberGemBoardSize
  minPathLength: number
  maxPathLength: number
  maxGemValue: number
  targetMax: number
  types: readonly NumberGemPuzzleType[]
}

const GENERATOR_CONFIG: Record<NumberGemDifficulty, GeneratorConfig> = {
  beginner: { boardSize: 3, minPathLength: 2, maxPathLength: 2, maxGemValue: 6, targetMax: 10, types: ['combine'] },
  growth: { boardSize: 3, minPathLength: 2, maxPathLength: 3, maxGemValue: 7, targetMax: 15, types: ['combine', 'take-away'] },
  challenge: { boardSize: 4, minPathLength: 2, maxPathLength: 3, maxGemValue: 8, targetMax: 20, types: ['combine', 'take-away'] },
  adult: { boardSize: 4, minPathLength: 2, maxPathLength: 4, maxGemValue: 9, targetMax: 20, types: ['combine', 'take-away'] },
}

function createRandom(seed: number): () => number {
  let value = (seed >>> 0) || 0x9e3779b9
  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function mixSeed(seed: number, attempt: number): number {
  return (seed + Math.imul(attempt + 1, 0x9e3779b9)) >>> 0
}

function isAdjacent(first: number, second: number, boardSize: NumberGemBoardSize): boolean {
  const firstRow = Math.floor(first / boardSize)
  const firstColumn = first % boardSize
  const secondRow = Math.floor(second / boardSize)
  const secondColumn = second % boardSize
  return Math.abs(firstRow - secondRow) + Math.abs(firstColumn - secondColumn) === 1
}

export function enumerateNumberGemPaths(
  boardSize: NumberGemBoardSize,
  minPathLength: number,
  maxPathLength: number,
): readonly (readonly number[])[] {
  const paths: number[][] = []
  const cellCount = boardSize * boardSize

  const visit = (path: number[]) => {
    if (path.length >= minPathLength) {
      paths.push([...path])
    }
    if (path.length >= maxPathLength) {
      return
    }

    const lastCell = path[path.length - 1]!
    for (let nextCell = 0; nextCell < cellCount; nextCell += 1) {
      if (!path.includes(nextCell) && isAdjacent(lastCell, nextCell, boardSize)) {
        visit([...path, nextCell])
      }
    }
  }

  for (let start = 0; start < cellCount; start += 1) {
    visit([start])
  }
  return paths
}

function pathTotal(board: readonly number[], path: readonly number[]): number {
  return path.reduce((total, cellIndex) => total + board[cellIndex]!, 0)
}

function countSolutions(
  board: readonly number[],
  paths: readonly (readonly number[])[],
  target: number,
): number {
  return paths.filter((path) => pathTotal(board, path) === target).length
}

export function findNumberGemSolutionPath(puzzle: NumberGemPuzzle): readonly number[] | null {
  const paths = enumerateNumberGemPaths(puzzle.boardSize, puzzle.minPathLength, puzzle.maxPathLength)
  return paths.find((path) => pathTotal(puzzle.board, path) === puzzle.target) ?? null
}

function createGeneratedPuzzle(
  seed: number,
  difficulty: NumberGemDifficulty,
  type: NumberGemPuzzleType,
): NumberGemPuzzle {
  const config = GENERATOR_CONFIG[difficulty]
  const paths = enumerateNumberGemPaths(config.boardSize, config.minPathLength, config.maxPathLength)

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const random = createRandom(mixSeed(seed, attempt))
    const board = Array.from({ length: config.boardSize * config.boardSize }, () => 1 + Math.floor(random() * config.maxGemValue))
    const anchorPath = paths[Math.floor(random() * paths.length)]!
    const target = pathTotal(board, anchorPath)
    if (target > config.targetMax || target < 3) {
      continue
    }

    const solutionCount = countSolutions(board, paths, target)
    if (solutionCount < 2) {
      continue
    }

    if (type === 'combine') {
      return {
        version: 1,
        id: `generated-${difficulty}-${seed >>> 0}-${attempt}`,
        seed: seed >>> 0,
        boardSize: config.boardSize,
        board,
        type,
        target,
        start: null,
        remaining: null,
        minPathLength: config.minPathLength,
        maxPathLength: config.maxPathLength,
        solutionCount,
      }
    }

    if (target > 15) {
      continue
    }
    const maximumRemaining = Math.min(8, 20 - target)
    if (maximumRemaining < 3) {
      continue
    }
    const remaining = 3 + Math.floor(random() * (maximumRemaining - 2))
    return {
      version: 1,
      id: `generated-${difficulty}-${seed >>> 0}-${attempt}`,
      seed: seed >>> 0,
      boardSize: config.boardSize,
      board,
      type,
      target,
      start: target + remaining,
      remaining,
      minPathLength: config.minPathLength,
      maxPathLength: config.maxPathLength,
      solutionCount,
    }
  }

  throw new Error(`無法建立${difficulty}的固定種子題目`)
}

export function createNumberGemPuzzle(
  seed: number,
  difficulty: NumberGemDifficulty,
  requestedType?: NumberGemPuzzleType,
): NumberGemPuzzle {
  const config = GENERATOR_CONFIG[difficulty]
  const type = requestedType ?? config.types[seed % config.types.length]!
  return createGeneratedPuzzle(seed, difficulty, type)
}

const TUTORIAL_DEFINITIONS: readonly Omit<NumberGemPuzzle, 'solutionCount'>[] = [
  {
    version: 1,
    id: 'tutorial-1',
    seed: 1101,
    boardSize: 3,
    board: [2, 3, 1, 4, 2, 4, 1, 3, 5],
    type: 'combine',
    target: 5,
    start: null,
    remaining: null,
    minPathLength: 2,
    maxPathLength: 2,
  },
  {
    version: 1,
    id: 'tutorial-2',
    seed: 1102,
    boardSize: 3,
    board: [2, 5, 1, 3, 4, 2, 1, 3, 6],
    type: 'combine',
    target: 7,
    start: null,
    remaining: null,
    minPathLength: 2,
    maxPathLength: 3,
  },
  {
    version: 1,
    id: 'tutorial-3',
    seed: 1103,
    boardSize: 4,
    board: [2, 7, 1, 4, 3, 6, 2, 5, 1, 3, 4, 2, 6, 1, 5, 3],
    type: 'combine',
    target: 9,
    start: null,
    remaining: null,
    minPathLength: 2,
    maxPathLength: 3,
  },
  {
    version: 1,
    id: 'tutorial-4',
    seed: 1104,
    boardSize: 4,
    board: [2, 3, 1, 4, 4, 1, 2, 5, 1, 4, 3, 2, 6, 1, 2, 3],
    type: 'take-away',
    target: 5,
    start: 12,
    remaining: 7,
    minPathLength: 2,
    maxPathLength: 4,
  },
]

export function createNumberGemTutorialPuzzle(step: number): NumberGemPuzzle {
  const definition = TUTORIAL_DEFINITIONS[Math.max(0, Math.min(step, TUTORIAL_DEFINITIONS.length - 1))]!
  const paths = enumerateNumberGemPaths(definition.boardSize, definition.minPathLength, definition.maxPathLength)
  const solutionCount = countSolutions(definition.board, paths, definition.target)
  if (solutionCount < 1) {
    throw new Error(`教學第 ${step + 1} 關沒有有效解法`)
  }
  return { ...definition, solutionCount }
}

export const NUMBER_GEM_TUTORIAL_COUNT = TUTORIAL_DEFINITIONS.length
