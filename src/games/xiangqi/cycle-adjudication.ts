import type { XiangqiPlayer } from './rules'

// 此模組只比較已完成棋例分類的雙方責任；不可把單純重複局面送進來當長捉。
export type XiangqiCycleConduct = 'perpetual-check' | 'perpetual-chase' | 'no-offence'

export type XiangqiCycleDecision =
  | { readonly kind: 'draw'; readonly loser: null }
  | { readonly kind: 'loss'; readonly loser: XiangqiPlayer }

export interface XiangqiRepeatedCycle {
  readonly startIndex: number
  readonly period: number
  readonly repetitions: 3
}

export interface XiangqiCycleMoveEvidence {
  readonly mover: XiangqiPlayer
  readonly gaveCheck: boolean
  readonly threatensCapture: boolean
}

/** 只對有充分證據的長將或完全無攻擊循環下結論；長捉例外留待完整棋例分類。 */
export function classifyCertainXiangqiCycleConduct(
  moves: readonly XiangqiCycleMoveEvidence[],
  player: XiangqiPlayer,
): XiangqiCycleConduct | null {
  const ownMoves = moves.filter(move => move.mover === player)
  if (ownMoves.length === 0) return null
  if (ownMoves.every(move => move.gaveCheck)) return 'perpetual-check'
  if (ownMoves.every(move => !move.gaveCheck && !move.threatensCapture)) return 'no-offence'
  return null
}

/** 局面鍵含輪到哪方走棋；只接受連續、完整的三個雙方循環。 */
export function findThreeXiangqiCycles(positionHistory: readonly string[]): XiangqiRepeatedCycle | null {
  for (let period = 2; period * 3 < positionHistory.length; period += 2) {
    const startIndex = positionHistory.length - period * 3 - 1
    let same = true
    for (let offset = 0; offset <= period * 2; offset += 1) {
      if (positionHistory[startIndex + offset] !== positionHistory[startIndex + offset + period]) {
        same = false
        break
      }
    }
    if (same) return { startIndex, period, repetitions: 3 }
  }
  return null
}

const SEVERITY: Readonly<Record<XiangqiCycleConduct, number>> = {
  'no-offence': 0,
  'perpetual-chase': 1,
  'perpetual-check': 2,
}

/** 協會 113 年修訂版「循環盤面之判決」表：雙方不變著時，比較犯例程度。 */
export function adjudicateXiangqiCycle(
  red: XiangqiCycleConduct,
  black: XiangqiCycleConduct,
): XiangqiCycleDecision {
  if (SEVERITY[red] === SEVERITY[black]) return { kind: 'draw', loser: null }
  return { kind: 'loss', loser: SEVERITY[red] > SEVERITY[black] ? 'red' : 'black' }
}
