import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, FeedbackCard, ToolButton } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import {
  GOMOKU_ADVENTURE_LEVELS,
  completesGomokuAdventureLevel,
  createGomokuAdventureState,
  getGomokuAdventureLevel,
  isGomokuAdventureStateComplete,
  isGomokuAdventureMoveCorrect,
  nextGomokuAdventureLevel,
  type GomokuAdventureLevel,
  type GomokuAdventureLevelId,
} from './adventure'
import { useGomokuBoardKeyboardNavigation } from './board-navigation'
import { getGomokuForbiddenReason, playGomokuMove, type GomokuMove, type GomokuState } from './rules'
import { indexedDbGomokuStorage, type GomokuStorage } from './storage'

interface GomokuAdventureProps {
  onBack: () => void
  storage?: GomokuStorage
  artStyle: CSSProperties
}

function initialLevel(): GomokuAdventureLevel {
  return GOMOKU_ADVENTURE_LEVELS[0]!
}

function validLevelId(value: string): value is GomokuAdventureLevelId {
  return GOMOKU_ADVENTURE_LEVELS.some((level) => level.id === value)
}

export function GomokuAdventure({ onBack, storage = indexedDbGomokuStorage, artStyle }: GomokuAdventureProps) {
  const [levelId, setLevelId] = useState<GomokuAdventureLevelId>(initialLevel().id)
  const [state, setState] = useState<GomokuState>(() => createGomokuAdventureState(initialLevel()))
  const [completedLevelIds, setCompletedLevelIds] = useState<readonly GomokuAdventureLevelId[]>([])
  const [completedThisRun, setCompletedThisRun] = useState(false)
  const [hintLevel, setHintLevel] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [feedbackOverrideId, setFeedbackOverrideId] = useState<string | null>(null)
  const lastSpokenId = useRef<string | null>(null)
  const { isSupported, speak } = useSpeech()
  const level = getGomokuAdventureLevel(levelId)
  const hasRestoredCompletion = isGomokuAdventureStateComplete(level, state)
  const levelComplete = completedThisRun || hasRestoredCompletion

  const feedbackEntry = useMemo(() => {
    if (feedbackOverrideId !== null) return getChildText(feedbackOverrideId)
    if (levelComplete) return getChildText('gomoku.adventure_complete')
    if (isPaused) return getChildText('common.pause')
    return getChildText(level.instructionTextId)
  }, [feedbackOverrideId, isPaused, level.instructionTextId, levelComplete])

  useEffect(() => {
    let active = true
    void storage.load('adventure').then((session) => {
      if (!active || session === null) return
      const progress = session.adventureProgress
      if (progress === undefined || !validLevelId(progress.selectedLevelId)) return
      const restoredLevel = getGomokuAdventureLevel(progress.selectedLevelId)
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
      state,
      tutorialStep: 0,
      adventureProgress: { selectedLevelId: levelId, completedLevelIds },
    })
  }, [completedLevelIds, hintLevel, isHydrated, levelId, state, storage])

  useEffect(() => {
    if (!isHydrated || lastSpokenId.current === feedbackEntry.id) return
    lastSpokenId.current = feedbackEntry.id
    speak(feedbackEntry)
  }, [feedbackEntry, isHydrated, speak])

  const loadLevel = (nextLevel: GomokuAdventureLevel) => {
    setLevelId(nextLevel.id)
    setState(createGomokuAdventureState(nextLevel))
    setCompletedThisRun(false)
    setHintLevel(0)
    setIsPaused(false)
    setFeedbackOverrideId(null)
  }

  const suggestedMoves = hintLevel >= 3 ? level.targetMoves : []
  const boardLocked = isPaused || levelComplete || state.phase !== 'playing'
  const { getCellNavigationProps } = useGomokuBoardKeyboardNavigation({ board: state.board, isLocked: boardLocked })

  const chooseCell = (move: GomokuMove) => {
    if (boardLocked || state.board[move] !== null) return

    const forbiddenReason = getGomokuForbiddenReason(state, move)
    if (forbiddenReason !== null) {
      const entry = getChildText(`gomoku.forbidden_${forbiddenReason}`)
      setFeedbackOverrideId(entry.id)
      speak(entry)
      return
    }

    if (!isGomokuAdventureMoveCorrect(level, state, move)) {
      const entry = getChildText('gomoku.adventure_try_marked')
      setFeedbackOverrideId(entry.id)
      speak(entry)
      return
    }

    if (!completesGomokuAdventureLevel(level, state, move)) return
    setState(playGomokuMove(state, move))
    setHintLevel(0)
    setCompletedThisRun(true)
    setCompletedLevelIds((current) => current.includes(level.id) ? current : [...current, level.id])
    const entry = getChildText('gomoku.adventure_complete')
    setFeedbackOverrideId(entry.id)
    speak(entry)
  }

  const showHint = () => {
    if (boardLocked) return
    const nextHintLevel = Math.min(hintLevel + 1, 4)
    setHintLevel(nextHintLevel)
    const hintId = nextHintLevel === 1
      ? level.instructionTextId
      : nextHintLevel === 2
        ? 'gomoku.adventure_hint_area'
        : nextHintLevel === 3
          ? 'gomoku.adventure_hint_candidate'
          : 'gomoku.adventure_hint_demo'
    setFeedbackOverrideId(hintId)
    speak(getChildText(hintId))
  }

  const nextLevel = nextGomokuAdventureLevel(level.id)

  return (
    <main className="gomoku-proposal gomoku-proposal--adventure gomoku-proposal--formal-r04" style={artStyle}>
      <section className="gomoku-proposal__frame" aria-label={getChildText('gomoku.adventure_title').text_zh_tw}>
        <header className="gomoku-proposal__header">
          <BopomofoText as="h1" className="gomoku-proposal__title" entry={getChildText('gomoku.adventure_title')} />
          <BopomofoText className="gomoku-proposal__badge" entry={getChildText('gomoku.adventure_badge')} />
        </header>
        <div className="gomoku-proposal__layout">
          <section className="gomoku-board-panel">
            <BopomofoText as="p" className="gomoku-turn" entry={getChildText(level.titleTextId)} role="status" />
            <div className="gomoku-board__frame">
              <div className="gomoku-board" role="grid" aria-label={getChildText('gomoku.title').text_zh_tw} aria-rowcount={15} aria-colcount={15}>
                {state.board.map((cell, index) => {
                  const move = index as GomokuMove
                  const isSuggested = suggestedMoves.includes(index)
                  const isForbiddenMarker = level.forbiddenMove === index
                  const entry = cell === 'black'
                    ? getChildText('gomoku.black_piece')
                    : cell === 'white'
                      ? getChildText('gomoku.white_piece')
                      : getChildText('gomoku.empty_cell')
                  return (
                    <button
                      key={move}
                      className={`gomoku-cell ${cell ? `gomoku-cell--${cell}` : ''} ${isSuggested ? 'gomoku-cell--suggested' : ''} ${isForbiddenMarker ? 'gomoku-cell--forbidden' : ''}`.trim()}
                      type="button"
                      role="gridcell"
                      aria-label={entry.text_zh_tw}
                      aria-rowindex={Math.floor(move / 15) + 1}
                      aria-colindex={(move % 15) + 1}
                      disabled={boardLocked || cell !== null}
                      onClick={() => chooseCell(move)}
                      {...getCellNavigationProps(move)}
                    >
                      {cell ? <span className="gomoku-stone" aria-hidden="true" /> : null}
                      {isForbiddenMarker ? <span className="gomoku-forbidden-marker" aria-hidden="true">×</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
          <aside className="gomoku-controls">
            <FeedbackCard entry={feedbackEntry} tone={levelComplete ? 'positive' : 'hint'} />
            <div className="gomoku-adventure-levels" role="group" aria-label={getChildText('gomoku.adventure_badge').text_zh_tw}>
              {GOMOKU_ADVENTURE_LEVELS.map((candidate) => {
                const isComplete = completedLevelIds.includes(candidate.id)
                return (
                  <button
                    key={candidate.id}
                    className={`gomoku-adventure-level ${candidate.id === level.id ? 'gomoku-adventure-level--selected' : ''} ${isComplete ? 'gomoku-adventure-level--complete' : ''}`.trim()}
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
            <div className="gomoku-actions">
              <ChildActionButton entry={getChildText('common.hint')} icon="hint" tone="hint" disabled={boardLocked} onClick={showHint} />
              <ChildActionButton
                entry={getChildText(levelComplete && nextLevel !== null ? 'gomoku.adventure_next' : 'gomoku.adventure_retry')}
                icon={levelComplete && nextLevel !== null ? 'star' : 'retry'}
                tone="secondary"
                onClick={() => nextLevel !== null && levelComplete ? loadLevel(nextLevel) : loadLevel(level)}
              />
          </div>
          <div className="gomoku-tools">
            <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
            <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(feedbackEntry)} />
            <ToolButton entry={getChildText(isPaused ? 'common.resume' : 'common.pause')} icon="pause" aria-pressed={isPaused} onClick={() => setIsPaused((value) => !value)} />
          </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
