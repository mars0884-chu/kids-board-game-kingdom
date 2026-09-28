import type { XiangqiKind, XiangqiPlayer } from './rules'

// 只依正式規則有明確判準的循環行為作分類；缺少逐步證據時不猜測。
export type XiangqiCycleConduct = 'perpetual-check' | 'perpetual-chase' | 'no-offence'

export type XiangqiCycleDecision =
  | { readonly kind: 'draw'; readonly loser: null }
  | { readonly kind: 'loss'; readonly loser: XiangqiPlayer }

export interface XiangqiRepeatedCycle {
  readonly startIndex: number
  readonly period: number
  readonly repetitions: 3
}

export interface XiangqiChaseTargetEvidence {
  readonly targetId: string
  readonly targetKind: XiangqiKind
  readonly targetUncrossedSoldier: boolean
  readonly attackerIds: readonly string[]
  readonly attackerKinds: readonly XiangqiKind[]
  readonly trueRootAttackerIds: readonly string[]
  readonly pinnedAttackerIds: readonly string[]
  readonly blockedHorseLegAttackerIds: readonly string[]
}

export interface XiangqiCycleMoveEvidence {
  readonly mover: XiangqiPlayer
  readonly gaveCheck: boolean
  readonly threatensCapture: boolean
  readonly chaseTargets?: readonly XiangqiChaseTargetEvidence[]
}

function targetIsPerpetualChase(target: XiangqiChaseTargetEvidence): boolean {
  if (target.targetUncrossedSoldier || target.attackerIds.length === 0 ||
      target.attackerIds.length !== target.attackerKinds.length) return false

  // 將帥或兵卒參與捉子，該目標不構成犯例。
  if (target.attackerKinds.some(kind => kind === 'king' || kind === 'soldier')) return false

  return target.attackerIds.some((attackerId, index) => {
    const attackerKind = target.attackerKinds[index]!
    const trueRoot = target.trueRootAttackerIds.includes(attackerId)
    const pinned = target.pinnedAttackerIds.includes(attackerId)
    const blockedHorseLeg = target.blockedHorseLegAttackerIds.includes(attackerId)

    // 長捉真根子不犯例；馬、炮捉有根車則是明文例外。
    if (trueRoot && !((attackerKind === 'horse' || attackerKind === 'cannon') && target.targetKind === 'chariot')) {
      return false
    }

    // 同類子通常不犯例；受牽制不能離線，以及活馬捉拐腳馬例外。
    if (attackerKind === target.targetKind && !pinned &&
        !(attackerKind === 'horse' && target.targetKind === 'horse' && blockedHorseLeg)) return false

    return true
  })
}

/** 依協會 113 年修訂版分類一方在三循環中的長將、長捉或未犯例。 */
export function classifyCertainXiangqiCycleConduct(
  moves: readonly XiangqiCycleMoveEvidence[],
  player: XiangqiPlayer,
): XiangqiCycleConduct | null {
  const ownMoves = moves.filter(move => move.mover === player)
  if (ownMoves.length === 0) return null

  if (ownMoves.every(move => move.gaveCheck)) return 'perpetual-check'
  // 一將一捉、一將一停等混合循環不以長將或長捉判負。
  if (ownMoves.some(move => move.gaveCheck)) return 'no-offence'

  let chasedTargetId: string | null = null
  let foundChase = false
  for (const move of ownMoves) {
    if (move.chaseTargets === undefined && move.threatensCapture) return null
    const targets = (move.chaseTargets ?? []).filter(targetIsPerpetualChase)
    // 一子分捉兩子或多子，以及循環中斷追捉，都不判長捉。
    if (targets.length !== 1) return 'no-offence'
    const targetId = targets[0]!.targetId
    if (chasedTargetId !== null && chasedTargetId !== targetId) return 'no-offence'
    chasedTargetId = targetId
    foundChase = true
  }

  return foundChase ? 'perpetual-chase' : 'no-offence'
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

/** 協會 113 年修訂版「循環盤面之判決」表：比較雙方犯例程度。 */
export function adjudicateXiangqiCycle(
  red: XiangqiCycleConduct,
  black: XiangqiCycleConduct,
): XiangqiCycleDecision {
  if (SEVERITY[red] === SEVERITY[black]) return { kind: 'draw', loser: null }
  return { kind: 'loss', loser: SEVERITY[red] > SEVERITY[black] ? 'red' : 'black' }
}
