import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, FeedbackCard, ToolButton } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { chooseReversiMove } from './ai'
import {
  REVERSI_ADVENTURE_LEVELS,
  createReversiAdventureState,
  getReversiAdventureLevel,
  isReversiAdventureMoveCorrect,
  isReversiAdventureStateComplete,
  nextReversiAdventureLevel,
  type ReversiAdventureLevel,
  type ReversiAdventureLevelId,
} from './adventure'
import { applyReversiMove, getLegalReversiMoves, type ReversiMove, type ReversiState } from './rules'
import { indexedDbReversiStorage, type ReversiStorage } from './storage'

interface ReversiAdventureProps {
  onBack: () => void
  storage?: ReversiStorage
}

const boardSize = 8
const directionOffsets: Readonly<Record<'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

function isDirectionKey(key: string): key is keyof typeof directionOffsets {
  return Object.hasOwn(directionOffsets, key)
}

function findNextMove(move: ReversiMove, legalMoves: readonly ReversiMove[], key: string): ReversiMove | null {
  if (!isDirectionKey(key)) return null
  const [rowOffset, columnOffset] = directionOffsets[key]
  let row = Math.floor(move / boardSize) + rowOffset
  let column = move % boardSize + columnOffset

  while (row >= 0 && row < boardSize && column >= 0 && column < boardSize) {
    const next = row * boardSize + column
    if (legalMoves.includes(next)) return next
    row += rowOffset
    column += columnOffset
  }
  return null
}

function initialLevel(): ReversiAdventureLevel {
  return REVERSI_ADVENTURE_LEVELS[0]!
}

function validLevelId(value: string): value is ReversiAdventureLevelId {
  return REVERSI_ADVENTURE_LEVELS.some((level) => level.id === value)
}

export function ReversiAdventure({ onBack, storage = indexedDbReversiStorage }: ReversiAdventureProps) {
  const [levelId, setLevelId] = useState<ReversiAdventureLevelId>(initialLevel().id)
  const [state, setState] = useState<ReversiState>(() => createReversiAdventureState(initialLevel()))
  const [completedLevelIds, setCompletedLevelIds] = useState<readonly ReversiAdventureLevelId[]>([])
  const [completedThisRun, setCompletedThisRun] = useState(false)
  const [pendingLevelCompletion, setPendingLevelCompletion] = useState(false)
  const [completionTurnCount, setCompletionTurnCount] = useState<number | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [feedbackOverrideId, setFeedbackOverrideId] = useState<string | null>(null)
  const [activeMove, setActiveMove] = useState<ReversiMove>(19)
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])
  const lastSpokenId = useRef<string | null>(null)
  const { isSupported, speak } = useSpeech()
  const level = getReversiAdventureLevel(levelId)
  const legalMoves = useMemo(() => getLegalReversiMoves(state), [state])
  const hasRestoredCompletion = isReversiAdventureStateComplete(level, state)
  const levelComplete = completedThisRun || (!pendingLevelCompletion && hasRestoredCompletion)
  const isNpcTurn = !isPaused && !levelComplete && state.phase === 'playing' && state.currentPlayer === 'white'
  const boardLocked = isPaused || levelComplete || pendingLevelCompletion || state.phase !== 'playing' || isNpcTurn

  const feedbackEntry = useMemo(() => {
    if (feedbackOverrideId !== null) return getChildText(feedbackOverrideId)
    if (levelComplete) return getChildText('reversi.adventure_complete')
    if (isPaused) return getChildText('common.pause')
    if (isNpcTurn || pendingLevelCompletion) return getChildText('reversi.npc_thinking')
    if (state.phase !== 'playing') {
      return state.winner === 'black'
        ? getChildText('reversi.result_black')
        : state.winner === 'white'
          ? getChildText('reversi.result_white')
          : getChildText('reversi.result_draw')
    }
    if (state.turns[state.turns.length - 1]?.kind === 'pass') return getChildText('reversi.forced_pass')
    return getChildText(level.instructionTextId)
  }, [feedbackOverrideId, isNpcTurn, isPaused, level.instructionTextId, levelComplete, pendingLevelCompletion, state.phase, state.turns, state.winner])

  useEffect(() => {
    let active = true
    void storage.load('adventure').then((session) => {
      if (!active || session === null) return
      const progress = session.adventureProgress
      if (progress === undefined || !validLevelId(progress.selectedLevelId)) return
      const restoredLevel = getReversiAdventureLevel(progress.selectedLevelId)
      setLevelId(restoredLevel.id)
      setState(session.state)
      setHintLevel(session.hintLevel)
      setCompletedLevelIds(progress.completedLevelIds.filter(validLevelId))
    }).finally(() => {
      if (active) setIsHydrated(true)
    })
    return () => { active = false }
  }, [storage])

  useEffect(() => {
    if (!isHydrated) return
    void storage.save('adventure', {
      difficulty: 'beginner',
      hintLevel,
      seed: 20260816,
      state,
      tutorialStep: REVERSI_ADVENTURE_LEVELS.findIndex((candidate) => candidate.id === levelId),
      adventureProgress: { selectedLevelId: levelId, completedLevelIds },
    })
  }, [completedLevelIds, hintLevel, isHydrated, levelId, state, storage])

  useEffect(() => {
    if (!isHydrated || lastSpokenId.current === feedbackEntry.id) return
    lastSpokenId.current = feedbackEntry.id
    speak(feedbackEntry)
  }, [feedbackEntry, isHydrated, speak])

  useEffect(() => {
    if (!isNpcTurn) return
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.phase !== 'playing' || current.currentPlayer !== 'white') return current
        const move = chooseReversiMove(current, 'beginner', 20260816 + current.turns.length * 97)
        return move === null ? current : applyReversiMove(current, move)
      })
    }, 420)
    return () => window.clearTimeout(timer)
  }, [isNpcTurn, state])

  useEffect(() => {
    if (!pendingLevelCompletion || completionTurnCount === null || state.turns.length < completionTurnCount) return
    setPendingLevelCompletion(false)
    setCompletionTurnCount(null)
    setCompletedThisRun(true)
    setCompletedLevelIds((current) => current.includes(level.id) ? current : [...current, level.id])
    const entry = getChildText('reversi.adventure_complete')
    setFeedbackOverrideId(entry.id)
    speak(entry)
  }, [completionTurnCount, level.id, pendingLevelCompletion, speak, state.turns.length])

  useEffect(() => {
    if (legalMoves.includes(activeMove)) return
    setActiveMove(legalMoves[0] ?? 0)
  }, [activeMove, legalMoves])

  const loadLevel = (nextLevel: ReversiAdventureLevel) => {
    setLevelId(nextLevel.id)
    setState(createReversiAdventureState(nextLevel))
    setCompletedThisRun(false)
    setPendingLevelCompletion(false)
    setCompletionTurnCount(null)
    setHintLevel(0)
    setIsPaused(false)
    setFeedbackOverrideId(null)
  }

  const suggestedMoves = hintLevel >= 3 ? level.targetMoves : []

  const chooseCell = (move: ReversiMove) => {
    if (boardLocked || !legalMoves.includes(move)) return
    if (!isReversiAdventureMoveCorrect(level, state, move)) {
      const entry = getChildText('reversi.adventure_try_again')
      setFeedbackOverrideId(entry.id)
      speak(entry)
      return
    }

    setState((current) => applyReversiMove(current, move))
    setActiveMove(move)
    setHintLevel(0)
    setFeedbackOverrideId(null)
    setPendingLevelCompletion(true)
    setCompletionTurnCount(state.turns.length + 2)
  }

  const showHint = () => {
    if (boardLocked) return
    const nextHintLevel = Math.min(hintLevel + 1, 4)
    setHintLevel(nextHintLevel)
    const hintId = nextHintLevel === 1
      ? level.instructionTextId
      : nextHintLevel === 2
        ? 'reversi.adventure_hint_area'
        : nextHintLevel === 3
          ? 'reversi.adventure_hint_candidate'
          : 'reversi.adventure_hint_demo'
    setFeedbackOverrideId(hintId)
    speak(getChildText(hintId))
  }

  const onCellKeyDown = (move: ReversiMove, event: KeyboardEvent<HTMLButtonElement>) => {
    if (boardLocked) return
    const nextMove = findNextMove(move, legalMoves, event.key)
    if (nextMove === null) return
    event.preventDefault()
    setActiveMove(nextMove)
    cellRefs.current[nextMove]?.focus()
  }

  const blackEntry = getChildText('reversi.black_piece')
  const whiteEntry = getChildText('reversi.white_piece')
  const activePlayer = state.phase === 'playing' ? state.currentPlayer : null
  const turnEntry = state.phase !== 'playing'
    ? feedbackEntry
    : isNpcTurn || pendingLevelCompletion
      ? getChildText('reversi.npc_thinking')
      : state.currentPlayer === 'black'
        ? getChildText(state.turns.length === 0 ? 'reversi.turn_black' : 'reversi.turn_black_next')
        : getChildText('reversi.turn_white')
  const nextLevel = nextReversiAdventureLevel(level.id)

  return (
    <main className="reversi-art-proposal reversi-art-proposal--adventure" aria-label={getChildText('reversi.adventure_title').text_zh_tw}>
      <section className="reversi-art-proposal__frame">
        <section className="reversi-art-proposal__board-panel">
          <div className="reversi-board" role="grid" aria-label={getChildText('reversi.title').text_zh_tw} aria-rowcount={8} aria-colcount={8}>
            {state.board.map((cell, index) => {
              const move = index as ReversiMove
              const isLegal = legalMoves.includes(move)
              const isSuggested = suggestedMoves.includes(move)
              const pieceEntry = cell === 'black' ? blackEntry : cell === 'white' ? whiteEntry : null
              return (
                <button
                  key={move}
                  ref={(element) => { cellRefs.current[move] = element }}
                  className={`reversi-cell ${cell ? `reversi-cell--${cell}` : ''} ${isLegal ? 'reversi-cell--legal' : ''} ${isSuggested ? 'reversi-cell--suggested' : ''}`.trim()}
                  type="button"
                  role="gridcell"
                  aria-label={pieceEntry?.text_zh_tw ?? (isLegal ? '可以落子的格子' : '空格')}
                  aria-rowindex={Math.floor(move / boardSize) + 1}
                  aria-colindex={(move % boardSize) + 1}
                  tabIndex={isLegal && activeMove === move ? 0 : -1}
                  disabled={boardLocked || !isLegal}
                  onFocus={() => setActiveMove(move)}
                  onKeyDown={(event) => onCellKeyDown(move, event)}
                  onClick={() => chooseCell(move)}
                >
                  {cell ? <span className="reversi-piece" aria-hidden="true" /> : null}
                  {isLegal ? <span className="reversi-cell__spark" aria-hidden="true">✦</span> : null}
                </button>
              )
            })}
          </div>
        </section>

        <aside className="reversi-art-proposal__controls">
          <header className="reversi-art-proposal__header">
            <div>
              <BopomofoText as="h1" className="reversi-art-proposal__title" entry={getChildText('reversi.adventure_title')} />
              <div className="reversi-art-proposal__badges">
                <BopomofoText className="reversi-art-proposal__badge" entry={getChildText('reversi.adventure_badge')} />
                <BopomofoText className="reversi-art-proposal__mode" entry={getChildText('reversi.mode_adventure')} />
              </div>
            </div>
          </header>
          <div className="reversi-score" aria-label={`${blackEntry.text_zh_tw} ${state.blackCount}，${whiteEntry.text_zh_tw} ${state.whiteCount}`}>
            <span className={`reversi-score__item reversi-score__item--black ${activePlayer === 'black' ? 'reversi-score__item--active' : activePlayer === 'white' ? 'reversi-score__item--inactive' : ''}`} aria-current={activePlayer === 'black' ? 'true' : undefined}>
              <span className="reversi-score__disc" aria-hidden="true" /><BopomofoText entry={blackEntry} /><strong>{state.blackCount}</strong>
            </span>
            <span className={`reversi-score__item reversi-score__item--white ${activePlayer === 'white' ? 'reversi-score__item--active' : activePlayer === 'black' ? 'reversi-score__item--inactive' : ''}`} aria-current={activePlayer === 'white' ? 'true' : undefined}>
              <span className="reversi-score__disc" aria-hidden="true" /><BopomofoText entry={whiteEntry} /><strong>{state.whiteCount}</strong>
            </span>
          </div>
          <BopomofoText className="reversi-turn" entry={turnEntry} role="status" />
          <BopomofoText className="reversi-adventure-level-title" entry={getChildText(level.titleTextId)} />
          <FeedbackCard entry={feedbackEntry} tone={levelComplete || state.turns[state.turns.length - 1]?.kind === 'pass' ? 'positive' : 'hint'} />
          <div className="reversi-adventure-levels" role="group" aria-label={getChildText('reversi.adventure_badge').text_zh_tw}>
            {REVERSI_ADVENTURE_LEVELS.map((candidate) => {
              const isComplete = completedLevelIds.includes(candidate.id)
              return (
                <button
                  key={candidate.id}
                  className={`reversi-adventure-level ${candidate.id === level.id ? 'reversi-adventure-level--selected' : ''} ${isComplete ? 'reversi-adventure-level--complete' : ''}`.trim()}
                  type="button"
                  aria-pressed={candidate.id === level.id}
                  onClick={() => loadLevel(candidate)}
                >
                  <span aria-hidden="true">{isComplete ? '★' : '○'}</span>
                  <BopomofoText entry={getChildText(candidate.titleTextId)} />
                </button>
              )
            })}
          </div>
          <div className="reversi-art-proposal__actions">
            <ChildActionButton entry={getChildText('common.hint')} icon="hint" tone="hint" disabled={boardLocked} onClick={showHint} />
            <ChildActionButton
              entry={getChildText(levelComplete && nextLevel !== null ? 'reversi.adventure_next' : 'reversi.adventure_retry')}
              icon={levelComplete && nextLevel !== null ? 'star' : 'retry'}
              tone="secondary"
              onClick={() => nextLevel !== null && levelComplete ? loadLevel(nextLevel) : loadLevel(level)}
            />
          </div>
          <div className="reversi-art-proposal__tools">
            <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
            <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(feedbackEntry)} />
            <ToolButton entry={getChildText(isPaused ? 'common.resume' : 'common.pause')} icon="pause" aria-pressed={isPaused} onClick={() => setIsPaused((value) => !value)} />
          </div>
        </aside>
      </section>
    </main>
  )
}
