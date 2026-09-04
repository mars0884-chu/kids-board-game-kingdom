import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { GOMOKU_BOARD_CELLS, GOMOKU_BOARD_SIZE, type GomokuCell, type GomokuMove } from './rules'

type DirectionKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

const directionOffsets: Readonly<Record<DirectionKey, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

function isDirectionKey(key: string): key is DirectionKey {
  return Object.hasOwn(directionOffsets, key)
}

function toRowColumn(move: GomokuMove): readonly [number, number] {
  return [Math.floor(move / GOMOKU_BOARD_SIZE), move % GOMOKU_BOARD_SIZE]
}

function toMove(row: number, column: number): GomokuMove {
  return row * GOMOKU_BOARD_SIZE + column
}

function isInBoard(row: number, column: number): boolean {
  return row >= 0 && row < GOMOKU_BOARD_SIZE && column >= 0 && column < GOMOKU_BOARD_SIZE
}

export function findNearestEmptyGomokuMove(board: readonly GomokuCell[], preferredMove: GomokuMove): GomokuMove | null {
  if (board[preferredMove] === null) return preferredMove

  const [preferredRow, preferredColumn] = toRowColumn(preferredMove)
  let nearestMove: GomokuMove | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let move = 0; move < GOMOKU_BOARD_CELLS; move += 1) {
    if (board[move] !== null) continue
    const [row, column] = toRowColumn(move)
    const distance = Math.abs(row - preferredRow) + Math.abs(column - preferredColumn)
    if (distance < nearestDistance) {
      nearestMove = move
      nearestDistance = distance
    }
  }

  return nearestMove
}

export function findNextEmptyGomokuMove(
  board: readonly GomokuCell[],
  currentMove: GomokuMove,
  key: string,
): GomokuMove | null {
  if (!isDirectionKey(key)) return null
  const [rowOffset, columnOffset] = directionOffsets[key]
  let [row, column] = toRowColumn(currentMove)

  row += rowOffset
  column += columnOffset
  while (isInBoard(row, column)) {
    const move = toMove(row, column)
    if (board[move] === null) return move
    row += rowOffset
    column += columnOffset
  }

  return null
}

interface GomokuBoardKeyboardNavigationOptions {
  board: readonly GomokuCell[]
  isLocked: boolean
}

export function useGomokuBoardKeyboardNavigation({ board, isLocked }: GomokuBoardKeyboardNavigationOptions) {
  const [activeMove, setActiveMove] = useState<GomokuMove>(Math.floor(GOMOKU_BOARD_CELLS / 2))
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (isLocked) return
    const nextMove = findNearestEmptyGomokuMove(board, activeMove)
    if (nextMove !== null && nextMove !== activeMove) setActiveMove(nextMove)
  }, [activeMove, board, isLocked])

  const getCellNavigationProps = useCallback((move: GomokuMove) => {
    const isAvailable = !isLocked && board[move] === null

    return {
      ref: (element: HTMLButtonElement | null) => {
        cellRefs.current[move] = element
      },
      tabIndex: isAvailable && activeMove === move ? 0 : -1,
      onFocus: isAvailable ? () => setActiveMove(move) : undefined,
      onKeyDown: isAvailable
        ? (event: KeyboardEvent<HTMLButtonElement>) => {
            const nextMove = findNextEmptyGomokuMove(board, move, event.key)
            if (nextMove === null) return
            event.preventDefault()
            setActiveMove(nextMove)
            cellRefs.current[nextMove]?.focus()
          }
        : undefined,
    }
  }, [activeMove, board, isLocked])

  return { getCellNavigationProps }
}
