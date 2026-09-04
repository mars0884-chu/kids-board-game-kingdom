import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, DifficultySelector, FeedbackCard, ToolButton, type DifficultyLevel } from '../../components/common-ui'
import { getChildText, type ChildTextEntry } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { DarkChessPiece } from './DarkChessPiece'
import { chooseDarkChessAction } from './ai'
import {
  DARK_CHESS_AUTO_DRAW_STEPS,
  DARK_CHESS_BOARD_CELLS,
  DARK_CHESS_BOARD_HEIGHT,
  DARK_CHESS_BOARD_WIDTH,
  applyDarkChessAction,
  createDarkChessState,
  getLegalDarkChessActions,
  getNpcDrawResponse,
  getPieceAt,
  type DarkChessAction,
  type DarkChessCell,
  type DarkChessColor,
  type DarkChessPieceKind,
  type DarkChessState,
} from './rules'
import type { DarkChessMode } from './storage'

interface DarkChessGameProps {
  onBack: () => void
  mode: DarkChessMode
  artProposal?: boolean
}

interface PlacedTutorialPiece {
  readonly id: string
  readonly cell: number
  readonly revealed?: boolean
}

const TUTORIAL_LEVELS: readonly {
  readonly title: string
  readonly instruction: string
}[] = [
  { title: 'dark_chess.level_flip', instruction: 'dark_chess.instruction_flip' },
  { title: 'dark_chess.level_side', instruction: 'dark_chess.instruction_side' },
  { title: 'dark_chess.level_move', instruction: 'dark_chess.instruction_move' },
  { title: 'dark_chess.level_capture', instruction: 'dark_chess.instruction_capture' },
  { title: 'dark_chess.level_cannon', instruction: 'dark_chess.instruction_cannon' },
  { title: 'dark_chess.level_draw', instruction: 'dark_chess.instruction_draw' },
]

const pieceEntryIds: Readonly<Record<DarkChessColor, Readonly<Record<DarkChessPieceKind, string>>>> = {
  red: {
    general: 'dark_chess.red_general',
    advisor: 'dark_chess.red_advisor',
    elephant: 'dark_chess.red_elephant',
    chariot: 'dark_chess.red_chariot',
    horse: 'dark_chess.red_horse',
    cannon: 'dark_chess.red_cannon',
    soldier: 'dark_chess.red_soldier',
  },
  black: {
    general: 'dark_chess.black_general',
    advisor: 'dark_chess.black_advisor',
    elephant: 'dark_chess.black_elephant',
    chariot: 'dark_chess.black_chariot',
    horse: 'dark_chess.black_horse',
    cannon: 'dark_chess.black_cannon',
    soldier: 'dark_chess.black_soldier',
  },
}

function pieceEntry(piece: ReturnType<typeof getPieceAt>): ChildTextEntry {
  if (piece === null) return getChildText('dark_chess.empty_cell')
  return getChildText(pieceEntryIds[piece.color][piece.kind])
}

function placedState(
  placed: readonly PlacedTutorialPiece[],
  options: { readonly currentPlayer?: 'player1' | 'player2'; readonly quietStreak?: number } = {},
): DarkChessState {
  const base = createDarkChessState(0x4b1d2e3f)
  const board: DarkChessCell[] = Array.from({ length: DARK_CHESS_BOARD_CELLS }, () => null)
  for (const item of placed) board[item.cell] = item.id
  return {
    ...base,
    board,
    pieces: base.pieces.map((piece) => {
      const item = placed.find((candidate) => candidate.id === piece.id)
      return item === undefined ? piece : { ...piece, revealed: item.revealed ?? true }
    }),
    currentPlayer: options.currentPlayer ?? 'player1',
    playerColors: { player1: 'red', player2: 'black' },
    quietStreak: options.quietStreak ?? 0,
  }
}

function createTutorialState(step: number): DarkChessState {
  if (step === 0) return createDarkChessState(0x4b1d2e3f)
  if (step === 1) return applyDarkChessAction(createDarkChessState(0x4b1d2e3f), { kind: 'flip', cell: 0 })
  if (step === 2) return placedState([
    { id: 'red-chariot-1', cell: 0 },
    { id: 'black-soldier-1', cell: 31 },
  ])
  if (step === 3) return placedState([
    { id: 'red-chariot-1', cell: 0 },
    { id: 'black-horse-1', cell: 1 },
    { id: 'black-soldier-1', cell: 31 },
  ])
  if (step === 4) return placedState([
    { id: 'red-cannon-1', cell: 0 },
    { id: 'black-soldier-1', cell: 1, revealed: false },
    { id: 'black-horse-1', cell: 3 },
    { id: 'black-soldier-2', cell: 31 },
  ])
  return placedState([
    { id: 'red-soldier-1', cell: 0 },
    { id: 'black-soldier-1', cell: 31 },
  ], { quietStreak: DARK_CHESS_AUTO_DRAW_STEPS - 1 })
}

function createArtProposalState(): DarkChessState {
  const base = createDarkChessState(0x5a2f41c7)
  const revealedIds = new Set([
    'red-cannon-1',
    'red-chariot-1',
    'red-soldier-1',
    'black-horse-1',
    'black-soldier-1',
  ])
  return {
    ...base,
    playerColors: { player1: 'red', player2: 'black' },
    pieces: base.pieces.map((piece) => revealedIds.has(piece.id) ? { ...piece, revealed: true } : piece),
  }
}

function isTutorialSuccess(step: number, state: DarkChessState): boolean {
  const latest = state.turns[state.turns.length - 1]
  if (step === 0) return latest?.kind === 'flip'
  if (step === 1) return state.turns.length >= 2 && latest?.kind === 'flip'
  if (step === 2) return latest?.kind === 'move'
  if (step === 3 || step === 4) return latest?.kind === 'capture'
  return state.phase === 'draw' && state.drawReason === 'automatic-50-steps'
}

function isOwnRevealedPiece(state: DarkChessState, cell: number): boolean {
  const piece = getPieceAt(state, cell)
  const color = state.playerColors[state.currentPlayer]
  return piece !== null && piece.revealed && color !== null && piece.color === color
}

export function DarkChessGame({ onBack, mode, artProposal = false }: DarkChessGameProps) {
  const [tutorialStep, setTutorialStep] = useState(artProposal ? 4 : 0)
  const [tutorialFinished, setTutorialFinished] = useState(false)
  const [state, setState] = useState<DarkChessState>(() => mode === 'adventure'
    ? artProposal ? createArtProposalState() : createTutorialState(0)
    : createDarkChessState())
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [notice, setNotice] = useState('')
  const { isPaused: isSpeechPaused, isSupported, speak, togglePause } = useSpeech()

  const legalActions = useMemo(() => getLegalDarkChessActions(state), [state])
  const legalFlips = legalActions.filter((action) => action.kind === 'flip')
  const tutorialSuccess = mode === 'adventure' && !tutorialFinished && isTutorialSuccess(tutorialStep, state)
  const pendingDrawResponse = state.drawOffer !== null
  const npcResponse = pendingDrawResponse && mode === 'npc' ? getNpcDrawResponse(state) : null
  const isNpcTurn = mode === 'npc' && !isPaused && !pendingDrawResponse && state.phase === 'playing' && state.currentPlayer === 'player2'
  const boardLocked = isPaused || tutorialSuccess || tutorialFinished || pendingDrawResponse || isNpcTurn || state.phase !== 'playing'

  useEffect(() => {
    if (!isNpcTurn) return
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.phase !== 'playing' || current.currentPlayer !== 'player2' || current.drawOffer !== null) return current
        const action = chooseDarkChessAction(current, difficulty, current.seed + current.turns.length * 97)
        if (action === null) return current
        try {
          return applyDarkChessAction(current, action)
        } catch {
          return current
        }
      })
    }, 420)
    return () => window.clearTimeout(timer)
  }, [difficulty, isNpcTurn])

  const setAction = (action: DarkChessAction) => {
    try {
      setState((current) => applyDarkChessAction(current, action))
      setSelectedCell(null)
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '這一步目前不能執行。')
    }
  }

  const chooseCell = (cell: number) => {
    if (boardLocked) return
    const flip = legalFlips.find((action) => action.kind === 'flip' && action.cell === cell)
    if (flip !== undefined) {
      setAction(flip)
      return
    }
    if (selectedCell !== null) {
      const target = legalActions.find((action) => (
        (action.kind === 'move' || action.kind === 'capture') && action.from === selectedCell && action.to === cell
      ))
      if (target !== undefined) {
        setAction(target)
        return
      }
    }
    if (isOwnRevealedPiece(state, cell)) {
      setSelectedCell(cell)
      setNotice('')
    } else {
      setSelectedCell(null)
    }
  }

  const restart = () => {
    setTutorialFinished(false)
    setTutorialStep(artProposal ? 4 : 0)
    setState(mode === 'adventure' ? artProposal ? createArtProposalState() : createTutorialState(0) : createDarkChessState())
    setSelectedCell(null)
    setIsPaused(false)
    setNotice('')
  }

  const nextTutorial = () => {
    if (!tutorialSuccess) return
    if (tutorialStep >= TUTORIAL_LEVELS.length - 1) {
      setTutorialFinished(true)
      return
    }
    const nextStep = tutorialStep + 1
    setTutorialStep(nextStep)
    setState(createTutorialState(nextStep))
    setSelectedCell(null)
    setNotice('')
  }

  const toggleGamePause = () => {
    setIsPaused((current) => !current)
    if (isSpeechPaused) togglePause()
    else if (!isPaused) togglePause()
  }

  const handleBoardContextMenu = (event: MouseEvent<HTMLDivElement>) => event.preventDefault()
  const modeEntry = getChildText(mode === 'adventure' ? 'home.adventure' : mode === 'npc' ? 'home.practice' : 'home.two_player')
  const titleEntry = getChildText('dark_chess.title')
  const feedbackEntry = tutorialSuccess
    ? getChildText('reversi.adventure_complete')
    : state.phase === 'won'
      ? state.winner === 'player1' ? getChildText('dark_chess.win') : getChildText('dark_chess.other_win')
      : state.phase === 'draw'
        ? getChildText('dark_chess.draw')
        : isPaused
          ? getChildText('common.pause')
          : tutorialFinished
            ? getChildText('dark_chess.tutorial_title')
            : mode === 'adventure'
              ? getChildText(TUTORIAL_LEVELS[tutorialStep]!.instruction)
              : isNpcTurn
                ? getChildText('dark_chess.npc_thinking')
                : notice
                  ? getChildText('dark_chess.choose_action')
                  : getChildText(state.playerColors[state.currentPlayer] === null ? 'dark_chess.turn_flip' : 'dark_chess.choose_action')
  const turnEntry = state.phase !== 'playing'
    ? feedbackEntry
    : getChildText(state.playerColors[state.currentPlayer] === null ? 'dark_chess.turn_flip' : 'dark_chess.choose_action')
  const pieceCount = state.board.filter((id) => id !== null).length
  const showAdventureProgressAction = mode === 'adventure' && (tutorialSuccess || tutorialFinished)
  const showStandaloneRestart = !showAdventureProgressAction

  return (
    <main className="dark-chess-game" aria-label={titleEntry.text_zh_tw}>
      <section className="dark-chess-game__frame">
        <section className="dark-chess-game__board-panel">
          <div
            className="dark-chess-game__board"
            role="grid"
            aria-label={getChildText('dark_chess.title').text_zh_tw}
            aria-rowcount={DARK_CHESS_BOARD_HEIGHT}
            aria-colcount={DARK_CHESS_BOARD_WIDTH}
            onContextMenu={handleBoardContextMenu}
          >
            {Array.from({ length: DARK_CHESS_BOARD_CELLS }, (_, cell) => {
              const piece = getPieceAt(state, cell)
              const hidden = piece !== null && !piece.revealed
              const entry = hidden ? getChildText('dark_chess.hidden_piece') : pieceEntry(piece)
              const isSelected = selectedCell === cell
              const isLegalFlip = legalFlips.some((action) => action.kind === 'flip' && action.cell === cell)
              const isLegalTarget = selectedCell !== null && legalActions.some((action) => (
                (action.kind === 'move' || action.kind === 'capture') && action.from === selectedCell && action.to === cell
              ))
              const isSelectable = isOwnRevealedPiece(state, cell)
              const isEnabled = isLegalFlip || isLegalTarget || isSelectable
              const className = [
                'dark-chess-game__cell',
                hidden ? 'dark-chess-game__cell--hidden' : '',
                piece?.revealed ? `dark-chess-game__cell--${piece.color}` : '',
                isSelected ? 'dark-chess-game__cell--selected' : '',
                isLegalTarget ? 'dark-chess-game__cell--target' : '',
                isLegalFlip ? 'dark-chess-game__cell--flip' : '',
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={cell}
                  className={className}
                  type="button"
                  role="gridcell"
                  aria-rowindex={Math.floor(cell / DARK_CHESS_BOARD_WIDTH) + 1}
                  aria-colindex={(cell % DARK_CHESS_BOARD_WIDTH) + 1}
                  aria-label={`第 ${cell + 1} 格，${entry.text_zh_tw}`}
                  disabled={boardLocked || !isEnabled}
                  onClick={() => chooseCell(cell)}
                >
                  {piece === null ? null : <DarkChessPiece color={piece.color} entry={entry} hidden={hidden} />}
                  {isLegalFlip ? <span className="dark-chess-game__marker" aria-hidden="true">✦</span> : null}
                </button>
              )
            })}
          </div>
          <p className="dark-chess-game__board-note"><BopomofoText entry={getChildText(
            state.playerColors[state.currentPlayer] === null
              ? 'dark_chess.instruction_flip'
              : mode === 'adventure'
                ? TUTORIAL_LEVELS[tutorialStep]!.instruction
                : 'dark_chess.choose_action',
          )} /></p>
        </section>

        <aside className="dark-chess-game__controls">
          <header className="dark-chess-game__header">
            <div>
              <div className="dark-chess-game__title-row">
                <BopomofoText as="h1" className="dark-chess-game__title" entry={titleEntry} />
                <span className="dark-chess-game__mode-badge">
                  <BopomofoText className="dark-chess-game__badge" entry={modeEntry} />
                </span>
              </div>
              <div className="dark-chess-game__badges">
                {mode === 'adventure' ? <BopomofoText className="dark-chess-game__badge" entry={getChildText(artProposal ? 'dark_chess.tutorial_title' : 'dark_chess.tutorial_badge')} /> : null}
              </div>
            </div>
          </header>

          <section className="dark-chess-game__status" aria-live="polite">
            <BopomofoText className="dark-chess-game__turn" role="status" entry={turnEntry} />
            <div className="dark-chess-game__stat">
              <BopomofoText entry={getChildText('dark_chess.quiet_counter')} />
              <strong aria-label={`${getChildText('dark_chess.quiet_counter').text_zh_tw}${state.quietStreak}／${DARK_CHESS_AUTO_DRAW_STEPS}`}>{state.quietStreak}／{DARK_CHESS_AUTO_DRAW_STEPS}</strong>
            </div>
            <div className="dark-chess-game__stat">
              <BopomofoText entry={getChildText('dark_chess.piece_count')} />
              <strong aria-label={`${getChildText('dark_chess.piece_count').text_zh_tw}${pieceCount}／32`}>{pieceCount}／32</strong>
            </div>
          </section>

          <FeedbackCard entry={feedbackEntry} tone={state.phase !== 'playing' || tutorialSuccess || tutorialFinished ? 'positive' : 'hint'} />

          {mode === 'npc' ? <DifficultySelector selected={difficulty} onChange={setDifficulty} /> : null}

          {pendingDrawResponse ? (
            <section className="dark-chess-game__draw-response" aria-label={getChildText('dark_chess.draw_waiting').text_zh_tw}>
              <BopomofoText entry={getChildText(mode === 'npc' ? (npcResponse === 'accept' ? 'dark_chess.accept_draw' : 'dark_chess.continue_game') : 'dark_chess.draw_waiting')} />
              <div className="dark-chess-game__actions">
                <ChildActionButton entry={getChildText('dark_chess.accept_draw')} icon="star" tone="primary" onClick={() => setAction({ kind: 'draw-response', response: 'accept' })} />
                <ChildActionButton entry={getChildText('dark_chess.continue_game')} icon="retry" tone="secondary" onClick={() => setAction({ kind: 'draw-response', response: 'reject' })} />
              </div>
            </section>
          ) : null}

          {mode === 'adventure' && (tutorialSuccess || tutorialFinished) ? (
            <div className="dark-chess-game__actions dark-chess-game__actions--single">
              <ChildActionButton entry={getChildText(tutorialFinished ? 'tictactoe.play_again' : 'reversi.adventure_next')} icon={tutorialFinished ? 'retry' : 'star'} tone="primary" onClick={tutorialFinished ? restart : nextTutorial} />
            </div>
          ) : null}

          <div className="dark-chess-game__actions">
            <ChildActionButton entry={getChildText('common.hint')} icon="hint" tone="hint" disabled={boardLocked} onClick={() => speak(feedbackEntry)} />
            <ChildActionButton entry={getChildText('dark_chess.offer_draw')} icon="pause" tone="secondary" disabled={boardLocked} onClick={() => setAction({ kind: 'draw-offer' })} />
          </div>
          {showStandaloneRestart ? (
            <div className="dark-chess-game__actions dark-chess-game__actions--single">
              <ChildActionButton entry={getChildText('tictactoe.play_again')} icon="retry" tone="secondary" onClick={restart} />
            </div>
          ) : null}
          <div className="dark-chess-game__tools">
            <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
            <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(feedbackEntry)} />
            <ToolButton entry={getChildText(isPaused ? 'common.resume' : 'common.pause')} icon="pause" aria-pressed={isPaused || isSpeechPaused} onClick={toggleGamePause} />
          </div>

          {mode === 'adventure' ? (
            <div className="dark-chess-game__progress" aria-label={getChildText('dark_chess.progress').text_zh_tw}>
              <BopomofoText entry={getChildText(tutorialFinished ? 'dark_chess.tutorial_title' : TUTORIAL_LEVELS[tutorialStep]!.title)} />
              <span>{tutorialFinished ? TUTORIAL_LEVELS.length : tutorialStep + 1}／{TUTORIAL_LEVELS.length}</span>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  )
}
