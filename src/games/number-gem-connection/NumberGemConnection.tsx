import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import {
  ChildActionButton,
  DifficultySelector,
  FeedbackCard,
  ToolButton,
  type DifficultyLevel,
} from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import {
  createNumberGemPuzzle,
  createNumberGemTutorialPuzzle,
  findNumberGemSolutionPath,
  NUMBER_GEM_TUTORIAL_COUNT,
} from './generator'
import {
  chooseNumberGemCell,
  createNumberGemState,
  evaluateNumberGemPath,
  undoNumberGemCell,
  type NumberGemPathEvaluation,
  type NumberGemState,
} from './rules'
import {
  indexedDbNumberGemStorage,
  type NumberGemMode,
  type NumberGemSession,
  type NumberGemStorage,
} from './storage'
import {
  createInitialNumberGemScore,
  isNumberGemLocalMatchComplete,
  NUMBER_GEM_LOCAL_QUESTIONS,
  recordNumberGemCompletion,
  type NumberGemScore,
} from './score'

const TUTORIAL_ENTRIES = [
  'number_gem.tutorial_1',
  'number_gem.tutorial_2',
  'number_gem.tutorial_3',
  'number_gem.tutorial_4',
] as const

const HINT_ENTRIES = [
  'number_gem.hint_goal',
  'number_gem.hint_area',
  'number_gem.hint_candidate',
  'number_gem.hint_demo',
] as const

function initialState(mode: NumberGemMode, difficulty: DifficultyLevel, tutorialStep: number, roundSeed: number): NumberGemState {
  if (mode === 'adventure') {
    return createNumberGemState(createNumberGemTutorialPuzzle(tutorialStep))
  }
  return createNumberGemState(createNumberGemPuzzle(roundSeed, difficulty))
}

function invalidFeedback(evaluation: NumberGemPathEvaluation): string {
  if (evaluation.reason === 'repeated-cell') return 'number_gem.invalid_repeat'
  if (evaluation.reason === 'non-adjacent') return 'number_gem.invalid_adjacent'
  if (evaluation.reason === 'too-long') return 'number_gem.invalid_max'
  return 'number_gem.choose'
}

interface NumberGemConnectionProps {
  mode?: NumberGemMode
  onBack: () => void
  storage?: NumberGemStorage
}

export function NumberGemConnection({
  mode = 'npc',
  onBack,
  storage = indexedDbNumberGemStorage,
}: NumberGemConnectionProps) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [tutorialStep, setTutorialStep] = useState(0)
  const [roundSeed, setRoundSeed] = useState(20260825)
  const [localPlayer, setLocalPlayer] = useState<1 | 2>(1)
  const [score, setScore] = useState<NumberGemScore>(() => createInitialNumberGemScore())
  const [state, setState] = useState<NumberGemState>(() => initialState(mode, 'beginner', 0, 20260825))
  const [hintLevel, setHintLevel] = useState(0)
  const [isGamePaused, setIsGamePaused] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [feedbackOverrideId, setFeedbackOverrideId] = useState<string | null>(
    mode === 'adventure' ? TUTORIAL_ENTRIES[0] : mode === 'local' ? 'number_gem.local_one' : null,
  )
  const [focusIndex, setFocusIndex] = useState(0)
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])
  const lastAutomaticSpeechId = useRef<string | null>(null)
  const { isPaused: isSpeechPaused, isSupported, speak, togglePause } = useSpeech()

  useEffect(() => {
    let active = true
    void storage.load(mode).then((session) => {
      if (!active || session === null) return
      setDifficulty(session.difficulty)
      setHintLevel(session.hintLevel)
      setState(session.state)
      setTutorialStep(session.tutorialStep)
      setRoundSeed(session.roundSeed)
      setLocalPlayer(session.localPlayer)
      setScore(session.score)
      setFeedbackOverrideId(mode === 'adventure'
        ? session.state.phase === 'completed' ? null : TUTORIAL_ENTRIES[Math.min(session.tutorialStep, TUTORIAL_ENTRIES.length - 1)]!
        : mode === 'local'
          ? isNumberGemLocalMatchComplete(session.score)
            ? null
            : session.localPlayer === 1 ? 'number_gem.local_one' : 'number_gem.local_two'
          : 'number_gem.round_ready')
    }).finally(() => {
      if (active) setIsHydrated(true)
    })
    return () => {
      active = false
    }
  }, [mode, storage])

  useEffect(() => {
    if (!isHydrated) return
    const session: NumberGemSession = { difficulty, hintLevel, state, tutorialStep, roundSeed, localPlayer, score }
    void storage.save(mode, session)
  }, [difficulty, hintLevel, isHydrated, localPlayer, mode, roundSeed, score, state, storage, tutorialStep])

  const pathEvaluation = useMemo(
    () => evaluateNumberGemPath(state.puzzle, state.path),
    [state.path, state.puzzle],
  )

  const localMatchComplete = mode === 'local' && isNumberGemLocalMatchComplete(score)

  const turnEntry = useMemo(() => {
    if (isGamePaused) return getChildText('number_gem.paused')
    if (localMatchComplete) return getChildText('number_gem.local_match_done')
    if (mode === 'local') return getChildText(localPlayer === 1 ? 'number_gem.local_one' : 'number_gem.local_two')
    if (state.phase === 'completed') return getChildText('number_gem.done')
    return getChildText('number_gem.choose')
  }, [isGamePaused, localPlayer, mode, state.phase])

  const feedbackEntry = useMemo(() => {
    if (localMatchComplete) return getChildText('number_gem.local_match_done')
    if (feedbackOverrideId !== null) return getChildText(feedbackOverrideId)
    if (isGamePaused) return getChildText('number_gem.paused')
    if (state.phase === 'completed') {
      return getChildText(mode === 'adventure' && tutorialStep === NUMBER_GEM_TUTORIAL_COUNT - 1 ? 'number_gem.adventure_done' : 'number_gem.done')
    }
    if (pathEvaluation.status === 'over') return getChildText('number_gem.over')
    if (mode === 'adventure') return getChildText(TUTORIAL_ENTRIES[Math.min(tutorialStep, TUTORIAL_ENTRIES.length - 1)]!)
    if (state.puzzle.type === 'take-away' && state.path.length === 0) return getChildText('number_gem.take_away_goal')
    if (hintLevel > 0) return getChildText(HINT_ENTRIES[Math.min(hintLevel, HINT_ENTRIES.length) - 1]!)
    return getChildText('number_gem.choose')
  }, [feedbackOverrideId, hintLevel, isGamePaused, localMatchComplete, mode, pathEvaluation.status, state.phase, state.path.length, state.puzzle.type, tutorialStep])

  useEffect(() => {
    if (!isHydrated || lastAutomaticSpeechId.current === feedbackEntry.id) return
    if (mode === 'adventure' || mode === 'local' || state.phase === 'completed') {
      lastAutomaticSpeechId.current = feedbackEntry.id
      speak(feedbackEntry)
    }
  }, [feedbackEntry, isHydrated, mode, speak, state.phase])

  useEffect(() => {
    setFocusIndex(0)
    cellRefs.current = []
  }, [state.puzzle.id])

  const suggestedPath = useMemo(() => {
    if (hintLevel < 3 || state.phase === 'completed') return null
    return findNumberGemSolutionPath(state.puzzle)
  }, [hintLevel, state.phase, state.puzzle])

  const resetRound = (nextDifficulty = difficulty, nextSeed = roundSeed, nextPlayer = localPlayer, nextTutorialStep = tutorialStep) => {
    setDifficulty(nextDifficulty)
    setRoundSeed(nextSeed)
    setLocalPlayer(nextPlayer)
    setTutorialStep(nextTutorialStep)
    setState(initialState(mode, nextDifficulty, nextTutorialStep, nextSeed))
    setHintLevel(0)
    setIsGamePaused(false)
    setFocusIndex(0)
    setFeedbackOverrideId(mode === 'adventure'
      ? TUTORIAL_ENTRIES[nextTutorialStep]!
      : mode === 'local'
        ? nextPlayer === 1 ? 'number_gem.local_one' : 'number_gem.local_two'
        : 'number_gem.round_ready')
  }

  const restart = () => {
    void storage.clear(mode).finally(() => {
      setScore(createInitialNumberGemScore())
      resetRound(mode === 'adventure' ? 'beginner' : difficulty, roundSeed, mode === 'local' ? 1 : localPlayer, mode === 'adventure' ? 0 : tutorialStep)
    })
  }

  const advanceRound = () => {
    if (state.phase !== 'completed') return
    if (mode === 'adventure') {
      if (tutorialStep + 1 < NUMBER_GEM_TUTORIAL_COUNT) {
        resetRound('beginner', roundSeed, 1, tutorialStep + 1)
      } else {
        setScore(createInitialNumberGemScore())
        resetRound('beginner', roundSeed, 1, 0)
      }
      return
    }
    if (mode === 'local' && !localMatchComplete) {
      const nextPlayer = localPlayer === 1 ? 2 : 1
      resetRound(difficulty, roundSeed + 1, nextPlayer, tutorialStep)
      return
    }
    resetRound(difficulty, roundSeed + 1, localPlayer, tutorialStep)
  }

  const chooseCell = (cellIndex: number) => {
    if (isGamePaused || state.phase === 'completed' || localMatchComplete) return
    setFocusIndex(cellIndex)
    const result = chooseNumberGemCell(state, cellIndex)
    if (result.state === state) {
      const entry = getChildText(invalidFeedback(result.evaluation))
      setFeedbackOverrideId(entry.id)
      speak(entry)
      return
    }
    setState(result.state)
    if (result.state.phase === 'completed') {
      setScore((current) => recordNumberGemCompletion(current, mode, localPlayer))
    }
    setFeedbackOverrideId(null)
    setHintLevel(0)
  }

  const focusCell = (cellIndex: number) => {
    const bounded = Math.max(0, Math.min(state.puzzle.board.length - 1, cellIndex))
    setFocusIndex(bounded)
    cellRefs.current[bounded]?.focus()
  }

  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, cellIndex: number) => {
    const size = state.puzzle.boardSize
    let nextIndex: number | null = null
    if (event.key === 'ArrowUp') nextIndex = cellIndex - size
    if (event.key === 'ArrowDown') nextIndex = cellIndex + size
    if (event.key === 'ArrowLeft') nextIndex = cellIndex - 1
    if (event.key === 'ArrowRight') nextIndex = cellIndex + 1
    if (nextIndex === null || nextIndex < 0 || nextIndex >= state.puzzle.board.length) return
    if (event.key === 'ArrowLeft' && cellIndex % size === 0) return
    if (event.key === 'ArrowRight' && cellIndex % size === size - 1) return
    event.preventDefault()
    focusCell(nextIndex)
  }

  const showNextHint = () => {
    if (isGamePaused || state.phase === 'completed') return
    const nextLevel = Math.min(hintLevel + 1, HINT_ENTRIES.length)
    const entry = getChildText(HINT_ENTRIES[nextLevel - 1]!)
    setHintLevel(nextLevel)
    setFeedbackOverrideId(null)
    speak(entry)
  }

  const changeDifficulty = (level: DifficultyLevel) => {
    setFeedbackOverrideId(null)
    speak(getChildText(`difficulty.${level}`))
    setScore(createInitialNumberGemScore())
    resetRound(level, roundSeed + 1, localPlayer, tutorialStep)
  }

  const toggleGamePause = () => {
    setIsGamePaused((current) => !current)
    if (isSpeechPaused) togglePause()
    else if (!isGamePaused) togglePause()
  }

  const boardIsLocked = isGamePaused || state.phase === 'completed'
  const targetEntry = getChildText('number_gem.target')
  const currentTotalEntry = getChildText('number_gem.current_total')
  const selectedEntry = getChildText('number_gem.selected')
  const gemLabelEntry = getChildText('number_gem.gem_label')
  const scoreboardEntry = getChildText('number_gem.scoreboard')
  const playerOneEntry = getChildText('number_gem.player_one')
  const playerTwoEntry = getChildText('number_gem.player_two')
  const boardStyle = { '--number-gem-columns': state.puzzle.boardSize } as CSSProperties

  return (
    <main className={`number-gem-connection number-gem-connection--${mode}`}>
      <section className="number-gem-connection__frame" aria-label={getChildText('number_gem.title').text_zh_tw}>
        <header className="number-gem-connection__header">
          <BopomofoText as="h1" className="number-gem-connection__title" entry={getChildText('number_gem.title')} />
          <div className="number-gem-connection__header-meta">
            <BopomofoText className="number-gem-connection__badge" entry={getChildText('number_gem.goal_line')} />
            <section className={`number-gem-scoreboard number-gem-scoreboard--${mode}`} aria-label={scoreboardEntry.text_zh_tw}>
              <div className="number-gem-scoreboard__heading">
                <span aria-hidden="true">★</span>
                <BopomofoText entry={scoreboardEntry} />
              </div>
              {mode === 'local' ? (
                <div className="number-gem-scoreboard__players">
                  <div className={`number-gem-scoreboard__player ${localPlayer === 1 && !localMatchComplete ? 'number-gem-scoreboard__player--active' : ''}`.trim()}>
                    <BopomofoText entry={playerOneEntry} />
                    <strong aria-label={`${playerOneEntry.text_zh_tw}${score.localStars[1]}${getChildText('number_gem.star_unit').text_zh_tw}`}>{score.localStars[1]}</strong>
                    <span>{score.localQuestions[1]} / {NUMBER_GEM_LOCAL_QUESTIONS}</span>
                  </div>
                  <div className={`number-gem-scoreboard__player ${localPlayer === 2 && !localMatchComplete ? 'number-gem-scoreboard__player--active' : ''}`.trim()}>
                    <BopomofoText entry={playerTwoEntry} />
                    <strong aria-label={`${playerTwoEntry.text_zh_tw}${score.localStars[2]}${getChildText('number_gem.star_unit').text_zh_tw}`}>{score.localStars[2]}</strong>
                    <span>{score.localQuestions[2]} / {NUMBER_GEM_LOCAL_QUESTIONS}</span>
                  </div>
                </div>
              ) : (
                <strong className="number-gem-scoreboard__solo-score" aria-label={`${scoreboardEntry.text_zh_tw}${score.stars}${getChildText('number_gem.star_unit').text_zh_tw}`}>
                  {score.stars}{mode === 'adventure' ? ` / ${NUMBER_GEM_TUTORIAL_COUNT}` : ''}
                </strong>
              )}
            </section>
          </div>
        </header>

        <div className="number-gem-connection__layout">
          <section className="number-gem-board-panel">
            <div className="number-gem-board-panel__turn-row">
              <BopomofoText as="p" className="number-gem-turn" entry={turnEntry} role="status" />
              {mode === 'adventure' ? (
                <div className="number-gem-progress" aria-label={`${getChildText('number_gem.stage_label').text_zh_tw}${tutorialStep + 1}/${NUMBER_GEM_TUTORIAL_COUNT}`}>
                  <BopomofoText entry={getChildText('number_gem.stage_label')} />
                  <span aria-hidden="true">{tutorialStep + 1} / {NUMBER_GEM_TUTORIAL_COUNT}</span>
                </div>
              ) : null}
            </div>

            <div
              className={`number-gem-board number-gem-board--${state.puzzle.boardSize}`}
              role="grid"
              aria-label={getChildText('number_gem.title').text_zh_tw}
              style={boardStyle}
            >
              {state.puzzle.board.map((value, index) => {
                const pathOrder = state.path.indexOf(index)
                const isSelected = pathOrder >= 0
                const isSuggested = suggestedPath?.includes(index) ?? false
                return (
                  <button
                    key={`${state.puzzle.id}-${index}`}
                    ref={(element) => { cellRefs.current[index] = element }}
                    className={`number-gem-cell ${isSelected ? 'number-gem-cell--selected' : ''} ${isSuggested ? 'number-gem-cell--suggested' : ''}`.trim()}
                    type="button"
                    role="gridcell"
                    aria-label={`${gemLabelEntry.text_zh_tw}${value}`}
                    aria-pressed={isSelected}
                    tabIndex={index === focusIndex ? 0 : -1}
                    disabled={boardIsLocked}
                    onClick={() => chooseCell(index)}
                    onKeyDown={(event) => handleCellKeyDown(event, index)}
                  >
                    <span className="number-gem-cell__value" aria-hidden="true">{value}</span>
                    {isSelected ? <span className="number-gem-cell__order" aria-hidden="true">{pathOrder + 1}</span> : null}
                  </button>
                )
              })}
            </div>

            <div className="number-gem-target-card" aria-live="polite">
              <div className="number-gem-target-card__item">
                <BopomofoText entry={targetEntry} />
                <strong>{state.puzzle.target}</strong>
              </div>
              <div className="number-gem-target-card__item">
                <BopomofoText entry={currentTotalEntry} />
                <strong>{state.currentTotal}</strong>
              </div>
              {state.puzzle.type === 'take-away' ? (
                <BopomofoText className="number-gem-target-card__hint" entry={getChildText('number_gem.take_away_goal')} />
              ) : null}
            </div>

            <div className="number-gem-path" aria-live="polite">
              <BopomofoText entry={selectedEntry} />
              <span className="number-gem-path__values" aria-label={`${selectedEntry.text_zh_tw}${state.path.map((index) => state.puzzle.board[index]).join('加')}`}>
                {state.path.length > 0 ? state.path.map((index) => state.puzzle.board[index]).join(' ＋ ') : '—'}
              </span>
            </div>
          </section>

          <aside className="number-gem-controls">
            <FeedbackCard entry={feedbackEntry} tone={state.phase === 'completed' ? 'positive' : 'hint'} />
            {mode !== 'adventure' ? (
              <DifficultySelector selected={difficulty} onChange={changeDifficulty} disabled={isGamePaused} />
            ) : null}
            <div className="number-gem-actions">
              <ChildActionButton entry={getChildText('common.hint')} icon="hint" tone="hint" disabled={boardIsLocked} onClick={showNextHint} />
              <ChildActionButton entry={getChildText('number_gem.undo')} icon="retry" tone="secondary" disabled={boardIsLocked || state.path.length === 0} onClick={() => { setState(undoNumberGemCell(state)); setFeedbackOverrideId(null) }} />
              {state.phase === 'completed' && !localMatchComplete ? (
                <ChildActionButton entry={mode === 'adventure' && tutorialStep < NUMBER_GEM_TUTORIAL_COUNT - 1 ? getChildText('number_gem.next_stage') : getChildText('number_gem.next_puzzle')} icon="target" tone="primary" onClick={advanceRound} />
              ) : (
                <ChildActionButton entry={getChildText('common.try_again')} icon="retry" tone="secondary" onClick={restart} />
              )}
            </div>
            <div className="number-gem-tools">
              <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
              <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(feedbackEntry)} />
              <ToolButton entry={getChildText(isGamePaused ? 'common.resume' : 'common.pause')} icon="pause" aria-pressed={isGamePaused || isSpeechPaused} onClick={toggleGamePause} />
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
