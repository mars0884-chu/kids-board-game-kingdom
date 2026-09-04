import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, DifficultySelector, FeedbackCard, ToolButton, type DifficultyLevel } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { AnimalIcon } from './AnimalIcon'
import {
  ANIMAL_CHESS_BOARD_HEIGHT,
  ANIMAL_CHESS_BOARD_WIDTH,
  applyAnimalChessMove,
  chooseAnimalChessMove,
  createAnimalChessState,
  createAnimalChessTutorialState,
  getAnimalDenOwner,
  getAnimalPieceAt,
  getAnimalTrapOwner,
  getLegalAnimalChessMoves,
  isAnimalRiverCell,
  type AnimalChessState,
  type AnimalKind,
  type AnimalMove,
  type AnimalPlayer,
} from './rules'
import { indexedDbAnimalChessStorage, type AnimalChessMode, type AnimalChessStorage } from './storage'

const TUTORIAL_ENTRIES = [
  'animal_chess.tutorial_1',
  'animal_chess.tutorial_2',
  'animal_chess.tutorial_3',
  'animal_chess.tutorial_4',
  'animal_chess.tutorial_5',
  'animal_chess.tutorial_6',
] as const
const TUTORIAL_ACTION_ENTRIES = [
  ['animal_chess.tutorial_action_1', 'animal_chess.tutorial_action_1_check'],
  ['animal_chess.tutorial_action_2', 'animal_chess.tutorial_action_2_check'],
  ['animal_chess.tutorial_action_3', 'animal_chess.tutorial_action_3_check'],
  ['animal_chess.tutorial_action_4', 'animal_chess.tutorial_action_4_check'],
  ['animal_chess.tutorial_action_5', 'animal_chess.tutorial_action_5_blocked'],
  ['animal_chess.tutorial_action_6_trap', 'animal_chess.tutorial_action_6_den'],
] as const
const TUTORIAL_COUNT = TUTORIAL_ENTRIES.length
const ANIMAL_KIND_ENTRIES: Record<AnimalKind, string> = {
  elephant: 'animal_chess.elephant',
  lion: 'animal_chess.lion',
  tiger: 'animal_chess.tiger',
  leopard: 'animal_chess.leopard',
  wolf: 'animal_chess.wolf',
  dog: 'animal_chess.dog',
  cat: 'animal_chess.cat',
  mouse: 'animal_chess.mouse',
}

interface AnimalChessGameProps {
  mode?: AnimalChessMode
  onBack: () => void
  storage?: AnimalChessStorage
}

function pieceLabel(kind: AnimalKind, owner: AnimalPlayer): string {
  return `${owner === 'player1' ? '第一位玩家' : '第二位玩家'}${getChildText(ANIMAL_KIND_ENTRIES[kind]).text_zh_tw}`
}

function cellCoordinates(cell: number): { row: number; column: number } {
  return { row: Math.floor(cell / ANIMAL_CHESS_BOARD_WIDTH), column: cell % ANIMAL_CHESS_BOARD_WIDTH }
}

function tutorialActionId(step: number, substep: number): string {
  const boundedStep = Math.max(0, Math.min(TUTORIAL_COUNT - 1, step))
  const boundedSubstep = Math.max(0, Math.min(1, substep))
  return TUTORIAL_ACTION_ENTRIES[boundedStep]![boundedSubstep]!
}

function tutorialExpectedMove(step: number, substep: number): AnimalMove | null {
  if (step === 5 && substep === 1) return { from: 60, to: 59 }
  const moves: readonly (AnimalMove | null)[] = [
    { from: 31, to: 24 },
    { from: 31, to: 24 },
    { from: 31, to: 32 },
    { from: 15, to: 22 },
    { from: 18, to: 46 },
    { from: 51, to: 52 },
  ]
  return moves[step] ?? null
}

function migrateTutorialObservationState(state: AnimalChessState, step: number, substep: number): AnimalChessState {
  if (substep !== 1) return state
  if (step < 5) return createAnimalChessTutorialState(step as 0 | 1 | 2 | 3 | 4)
  if (step === 5) return createAnimalChessTutorialState(5, 'den')
  return state
}

export function AnimalChessGame({ mode = 'npc', onBack, storage = indexedDbAnimalChessStorage }: AnimalChessGameProps) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [tutorialStep, setTutorialStep] = useState(0)
  const [tutorialSubstep, setTutorialSubstep] = useState(0)
  const [tutorialComplete, setTutorialComplete] = useState(false)
  const [state, setState] = useState<AnimalChessState>(() => mode === 'adventure' ? createAnimalChessTutorialState(0) : createAnimalChessState())
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [feedbackId, setFeedbackId] = useState<string>(mode === 'adventure' ? tutorialActionId(0, 0) : mode === 'local' ? 'animal_chess.turn_one' : 'animal_chess.choose')
  const [isPaused, setIsPaused] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])
  const lastAutomaticSpeechId = useRef<string | null>(null)
  const { isPaused: isSpeechPaused, isSupported, speak, togglePause } = useSpeech()

  const activePlayer = mode === 'npc' ? 'player1' : state.currentPlayer
  const legalMoves = useMemo(() => {
    if (mode === 'npc' && state.currentPlayer === 'player2') return []
    if (mode === 'adventure' && tutorialComplete) return []
    const moves = [...getLegalAnimalChessMovesSafe(state)]
    if (mode !== 'adventure') return moves
    const expected = tutorialExpectedMove(tutorialStep, tutorialSubstep)
    return expected === null ? moves : moves.filter((move) => move.from === expected.from && move.to === expected.to)
  }, [mode, state, tutorialComplete, tutorialStep, tutorialSubstep])
  const selectedMoves = selectedCell === null ? [] : legalMoves.filter((move) => move.from === selectedCell)
  const selectedTargets = new Set(selectedMoves.map((move) => move.to))
  const isFinished = state.phase !== 'playing'
  const locked = isPaused || isFinished || (mode === 'npc' && state.currentPlayer === 'player2') || (mode === 'adventure' && tutorialComplete)

  useEffect(() => {
    let active = true
    void storage.load(mode).then((session) => {
      if (!active || session === null) return
      setDifficulty(session.difficulty)
      const nextTutorialStep = Math.max(0, Math.min(TUTORIAL_COUNT - 1, session.tutorialStep))
      const hasTutorialSetup = session.state.setup !== undefined
      setTutorialStep(nextTutorialStep)
      // 舊版把第二目標存在「走完後再點一次棋子」的觀察局面；新版第二目標是目的格點擊。
      // 來源選取不會被存檔，因此若不是第六關的真實第二回合，一律安全回到本關起點。
      const restoredTutorialSubstep = mode === 'adventure' && hasTutorialSetup && nextTutorialStep === 5 && session.tutorialSubstep === 1 ? 1 : 0
      setTutorialSubstep(restoredTutorialSubstep)
      setTutorialComplete(mode === 'adventure' && hasTutorialSetup ? session.tutorialComplete : false)
      const restoredState = mode === 'adventure' && !hasTutorialSetup
        ? createAnimalChessTutorialState(nextTutorialStep as 0 | 1 | 2 | 3 | 4 | 5)
        : mode === 'adventure'
          ? migrateTutorialObservationState(session.state, nextTutorialStep, restoredTutorialSubstep)
          : session.state
      setState(restoredState)
      setFeedbackId(restoredState.phase === 'playing'
        ? mode === 'adventure' ? session.tutorialComplete && hasTutorialSetup ? 'animal_chess.tutorial_success' : tutorialActionId(nextTutorialStep, restoredTutorialSubstep) : mode === 'local' ? restoredState.currentPlayer === 'player1' ? 'animal_chess.turn_one' : 'animal_chess.turn_two' : 'animal_chess.choose'
        : resultFeedback(restoredState))
    }).finally(() => {
      if (active) setIsHydrated(true)
    })
    return () => { active = false }
  }, [mode, storage])

  useEffect(() => {
    if (!isHydrated) return
    void storage.save(mode, { difficulty, tutorialStep, tutorialSubstep, tutorialComplete, state })
  }, [difficulty, isHydrated, mode, state, storage, tutorialComplete, tutorialStep, tutorialSubstep])

  useEffect(() => {
    if (mode !== 'npc' || state.phase !== 'playing' || state.currentPlayer !== 'player2' || isPaused) return
    const timer = window.setTimeout(() => {
      const move = chooseAnimalChessMove(state, state.seed, difficulty)
      if (!move) return
      setState((current) => applyAnimalChessMove(current, move))
      setFeedbackId('animal_chess.turn_one')
      setSelectedCell(null)
    }, 420)
    return () => window.clearTimeout(timer)
  }, [difficulty, isPaused, mode, state])

  useEffect(() => {
    if (!isHydrated || state.phase === 'playing') return
    const nextFeedback = resultFeedback(state)
    setFeedbackId(nextFeedback)
    if (lastAutomaticSpeechId.current === nextFeedback) return
    lastAutomaticSpeechId.current = nextFeedback
    speak(getChildText(nextFeedback))
  }, [isHydrated, speak, state])

  useEffect(() => {
    if (!isHydrated || mode !== 'adventure' || state.phase !== 'playing' || tutorialComplete) return
    if (lastAutomaticSpeechId.current === feedbackId) return
    lastAutomaticSpeechId.current = feedbackId
    speak(getChildText(feedbackId))
  }, [feedbackId, isHydrated, mode, speak, state.phase, tutorialComplete])

  function resetGame(nextTutorialStep = mode === 'adventure' ? tutorialStep : 0) {
    const boundedStep = Math.max(0, Math.min(TUTORIAL_COUNT - 1, nextTutorialStep))
    setState(mode === 'adventure' ? createAnimalChessTutorialState(boundedStep as 0 | 1 | 2 | 3 | 4 | 5) : createAnimalChessState())
    setSelectedCell(null)
    setTutorialStep(boundedStep)
    setTutorialSubstep(0)
    setTutorialComplete(false)
    setFeedbackId(mode === 'adventure' ? tutorialActionId(boundedStep, 0) : mode === 'local' ? 'animal_chess.turn_one' : 'animal_chess.choose')
    lastAutomaticSpeechId.current = null
  }

  function selectCell(cell: number) {
    if (locked) return
    const piece = getAnimalPieceAt(state, cell)

    if (mode === 'adventure' && !tutorialComplete) {
      const expected = tutorialExpectedMove(tutorialStep, tutorialSubstep)
      if (expected !== null && selectedCell === null && cell !== expected.from) {
        setFeedbackId(tutorialActionId(tutorialStep, tutorialSubstep))
        return
      }
      if (expected !== null && selectedCell !== null && cell !== expected.to && cell !== expected.from) {
        setFeedbackId('animal_chess.choose_target')
        return
      }
    }

    if (selectedCell !== null && selectedTargets.has(cell)) {
      const move = selectedMoves.find((candidate) => candidate.to === cell)
      if (!move) return
      const nextState = applyAnimalChessMove(state, move)
      if (mode === 'adventure') {
        if (tutorialStep === 5 && tutorialSubstep === 0) {
          setState(nextState)
          setTutorialSubstep(1)
          setFeedbackId(tutorialActionId(5, 1))
        } else {
          setState(nextState)
          setTutorialComplete(true)
          setFeedbackId(tutorialStep === TUTORIAL_COUNT - 1 ? 'animal_chess.tutorial_done' : 'animal_chess.tutorial_success')
        }
      } else {
        setState(nextState)
        setFeedbackId(mode === 'local' ? state.currentPlayer === 'player1' ? 'animal_chess.turn_two' : 'animal_chess.turn_one' : mode === 'npc' ? 'animal_chess.npc_thinking' : TUTORIAL_ENTRIES[tutorialStep] ?? TUTORIAL_ENTRIES[0])
      }
      setSelectedCell(null)
      return
    }
    if (piece?.owner === activePlayer) {
      setSelectedCell(cell)
      if (mode === 'adventure' && tutorialSubstep === 0 && tutorialStep !== 5 && tutorialExpectedMove(tutorialStep, tutorialSubstep)?.from === cell) {
        setTutorialSubstep(1)
        setFeedbackId(tutorialActionId(tutorialStep, 1))
      } else {
        setFeedbackId('animal_chess.choose_target')
      }
      return
    }
    setFeedbackId('animal_chess.invalid')
    speak(getChildText('animal_chess.invalid'))
  }

  function focusCell(cell: number) {
    const bounded = Math.max(0, Math.min(ANIMAL_CHESS_BOARD_WIDTH * ANIMAL_CHESS_BOARD_HEIGHT - 1, cell))
    cellRefs.current[bounded]?.focus()
  }

  function handleCellKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, cell: number) {
    const { row, column } = cellCoordinates(cell)
    let next: number | null = null
    if (event.key === 'ArrowUp' && row > 0) next = cell - ANIMAL_CHESS_BOARD_WIDTH
    if (event.key === 'ArrowDown' && row < ANIMAL_CHESS_BOARD_HEIGHT - 1) next = cell + ANIMAL_CHESS_BOARD_WIDTH
    if (event.key === 'ArrowLeft' && column > 0) next = cell - 1
    if (event.key === 'ArrowRight' && column < ANIMAL_CHESS_BOARD_WIDTH - 1) next = cell + 1
    if (next === null) return
    event.preventDefault()
    focusCell(next)
  }

  function changeDifficulty(level: DifficultyLevel) {
    setDifficulty(level)
    speak(getChildText(`difficulty.${level}`))
  }

  function advanceTutorial() {
    if (mode !== 'adventure' || !tutorialComplete) return
    const next = tutorialStep + 1 >= TUTORIAL_COUNT ? 0 : tutorialStep + 1
    resetGame(next)
  }

  const boardStyle = { '--animal-board-columns': ANIMAL_CHESS_BOARD_WIDTH, '--animal-board-rows': ANIMAL_CHESS_BOARD_HEIGHT } as CSSProperties
  const currentFeedback = getChildText(feedbackId)
  const tutorialInstruction = getChildText(tutorialComplete
    ? tutorialStep === TUTORIAL_COUNT - 1 ? 'animal_chess.tutorial_done' : 'animal_chess.tutorial_success'
    : TUTORIAL_ENTRIES[tutorialStep] ?? TUTORIAL_ENTRIES[0])

  return (
    <main className={`animal-chess-game animal-chess-game--${mode}`}>
      <section className="animal-chess-game__frame" aria-label={getChildText('animal_chess.title').text_zh_tw}>
        <header className="animal-chess-game__header">
          <div className="animal-chess-game__heading">
            <span className="animal-chess-game__heading-icon" aria-hidden="true">✦</span>
            <BopomofoText as="h1" className="animal-chess-game__title" entry={getChildText('animal_chess.title')} />
          </div>
          <div className="animal-chess-game__meta" aria-live="polite">
            <span className="animal-chess-game__meta-item"><BopomofoText entry={getChildText('animal_chess.piece_count')} /> <strong>{state.pieces.filter((piece) => !piece.captured).length}</strong></span>
            <span className="animal-chess-game__meta-item"><BopomofoText entry={getChildText('animal_chess.round_count')} /> <strong>{state.quietRounds}</strong></span>
          </div>
        </header>

        <div className="animal-chess-game__layout">
          <section className="animal-chess-board-panel">
            <div className="animal-chess-board-panel__status" role="status" aria-live="polite">
              <BopomofoText entry={currentFeedback} />
              {mode === 'adventure' ? <span className="animal-chess-tutorial-progress">{tutorialStep + 1} / {TUTORIAL_COUNT}</span> : null}
            </div>
            <div className="animal-chess-board" role="grid" aria-label={getChildText('animal_chess.title').text_zh_tw} style={boardStyle}>
              {state.board.map((pieceId, cell) => {
                const piece = getAnimalPieceAt(state, cell)
                const denOwner = getAnimalDenOwner(cell)
                const trapOwner = getAnimalTrapOwner(cell)
                const isRiver = isAnimalRiverCell(cell)
                const isSelected = selectedCell === cell
                const isTarget = selectedTargets.has(cell)
                const classes = [
                  'animal-chess-cell',
                  isRiver ? 'animal-chess-cell--river' : '',
                  denOwner ? 'animal-chess-cell--den' : '',
                  trapOwner ? 'animal-chess-cell--trap' : '',
                  isSelected ? 'animal-chess-cell--selected' : '',
                  isTarget ? 'animal-chess-cell--target' : '',
                ].filter(Boolean).join(' ')
                const label = piece ? pieceLabel(piece.kind, piece.owner) : denOwner ? getChildText('animal_chess.den').text_zh_tw : trapOwner ? getChildText('animal_chess.trap').text_zh_tw : isRiver ? getChildText('animal_chess.river').text_zh_tw : getChildText('animal_chess.empty').text_zh_tw
                return (
                  <button
                    key={cell}
                    ref={(element) => { cellRefs.current[cell] = element }}
                    className={classes}
                    type="button"
                    role="gridcell"
                    aria-label={label}
                    aria-selected={isSelected}
                    data-cell={cell}
                    data-piece-id={pieceId ?? undefined}
                    disabled={locked}
                    onClick={() => selectCell(cell)}
                    onKeyDown={(event) => handleCellKeyDown(event, cell)}
                  >
                    {denOwner ? <span className="animal-chess-cell__marker" aria-hidden="true">⌂</span> : null}
                    {trapOwner ? <span className="animal-chess-cell__marker" aria-hidden="true">◇</span> : null}
                    {piece ? <AnimalIcon kind={piece.kind} owner={piece.owner} /> : null}
                    {isTarget ? <span className="animal-chess-cell__target-dot" aria-hidden="true" /> : null}
                  </button>
                )
              })}
            </div>
          </section>

          <aside className="animal-chess-controls">
            <FeedbackCard entry={mode === 'adventure' ? tutorialInstruction : currentFeedback} tone={state.phase === 'won' || tutorialComplete ? 'positive' : 'hint'} />
            {mode === 'npc' ? <DifficultySelector selected={difficulty} onChange={changeDifficulty} disabled={isPaused || isFinished} /> : null}
    {mode === 'adventure' ? (
              <div className="animal-chess-tutorial-card">
                <div className="animal-chess-tutorial-card__progress">
                  <BopomofoText entry={getChildText('animal_chess.tutorial_badge')} />
                  <strong>{tutorialStep + 1} / {TUTORIAL_COUNT}</strong>
                </div>
                <div className="animal-chess-tutorial-card__goal">
                  <BopomofoText entry={getChildText('animal_chess.tutorial_goal')} />
                  <strong>{tutorialSubstep + 1} / 2</strong>
                </div>
                <BopomofoText className="animal-chess-tutorial-card__guide" entry={getChildText('animal_chess.tap_guide')} />
              </div>
            ) : null}
            <div className="animal-chess-actions">
              {mode === 'adventure' && tutorialComplete ? <ChildActionButton entry={getChildText(tutorialStep === TUTORIAL_COUNT - 1 ? 'animal_chess.tutorial_restart' : 'animal_chess.next')} icon={tutorialStep === TUTORIAL_COUNT - 1 ? 'retry' : 'target'} tone="primary" onClick={advanceTutorial} /> : null}
              <ChildActionButton entry={getChildText('common.try_again')} icon="retry" tone="secondary" onClick={() => resetGame()} />
            </div>
            <div className="animal-chess-tools">
              <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
              <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(currentFeedback)} />
              <ToolButton entry={getChildText(isPaused ? 'common.resume' : 'common.pause')} icon="pause" aria-pressed={isPaused || isSpeechPaused} onClick={() => { setIsPaused((value) => !value); if (isSpeechPaused) togglePause(); else if (!isPaused) togglePause() }} />
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}

function getLegalAnimalChessMovesSafe(state: AnimalChessState): readonly AnimalMove[] {
  // 只在這裡集中載入，避免棋盤元件自己推導合法走法。
  return getLegalAnimalChessMoves(state)
}

function resultFeedback(state: AnimalChessState): string {
  if (state.phase === 'won') return state.winner === 'player1' ? 'animal_chess.win' : 'animal_chess.other_win'
  if (state.phase === 'draw') return 'animal_chess.draw'
  return 'animal_chess.choose'
}
