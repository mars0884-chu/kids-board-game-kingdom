import { useEffect, useMemo, useRef, useState } from 'react'
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
import { chooseTicTacToeMove } from './ai'
import {
  createTicTacToeState,
  playTicTacToeMove,
  replayTicTacToeMoves,
  type TicTacToeMove,
  type TicTacToeState,
} from './rules'
import {
  indexedDbTicTacToeStorage,
  type TicTacToeMode,
  type TicTacToeStorage,
} from './storage'
import { TicTacToeCandidate, TicTacToePiece } from './TicTacToePiece'

const TUTORIAL_TARGETS: readonly TicTacToeMove[] = [8, 2, 6]
const TUTORIAL_REPLIES: readonly (TicTacToeMove | null)[] = [1, 3, null]
const TUTORIAL_ENTRIES = [
  'tictactoe.tutorial_follow',
  'tictactoe.tutorial_block',
  'tictactoe.tutorial_finish',
] as const
const HINT_ENTRIES = [
  'tictactoe.hint_goal',
  'tictactoe.hint_area',
  'tictactoe.hint_candidate',
  'tictactoe.hint_demo',
] as const

function createModeState(mode: TicTacToeMode): TicTacToeState {
  return mode === 'tutorial'
    ? replayTicTacToeMoves([4, 0])
    : createTicTacToeState()
}

interface TicTacToeProposalProps {
  mode?: TicTacToeMode
  onBack: () => void
  storage?: TicTacToeStorage
}

export function TicTacToeProposal({
  mode = 'npc',
  onBack,
  storage = indexedDbTicTacToeStorage,
}: TicTacToeProposalProps) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [state, setState] = useState<TicTacToeState>(() => createModeState(mode))
  const [tutorialStep, setTutorialStep] = useState(0)
  const [hintLevel, setHintLevel] = useState(0)
  const [isGamePaused, setIsGamePaused] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [feedbackOverrideId, setFeedbackOverrideId] = useState<string | null>(
    mode === 'tutorial' ? 'tictactoe.tutorial_turns' : null,
  )
  const { isPaused: isSpeechPaused, isSupported, speak, togglePause } = useSpeech()
  const lastAutomaticSpeechId = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    void storage.load(mode).then((session) => {
      if (!active || session === null) {
        return
      }

      setDifficulty(session.difficulty)
      setHintLevel(session.hintLevel)
      setState(session.state)
      setTutorialStep(session.tutorialStep)
      setFeedbackOverrideId('tictactoe.restored')
    }).finally(() => {
      if (active) {
        setIsHydrated(true)
      }
    })

    return () => {
      active = false
    }
  }, [mode, storage])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    void storage.save(mode, { difficulty, hintLevel, state, tutorialStep })
  }, [difficulty, hintLevel, isHydrated, mode, state, storage, tutorialStep])

  useEffect(() => {
    if (mode !== 'npc' || isGamePaused || state.phase !== 'playing' || state.currentPlayer !== 'o') {
      return
    }

    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.phase !== 'playing' || current.currentPlayer !== 'o') {
          return current
        }

        const move = chooseTicTacToeMove(
          current,
          difficulty,
          20260809 + current.moves.length * 97,
        )
        return move === null ? current : playTicTacToeMove(current, move)
      })
      setFeedbackOverrideId(null)
    }, 420)

    return () => window.clearTimeout(timer)
  }, [difficulty, isGamePaused, mode, state])

  const turnEntry = useMemo(() => {
    if (isGamePaused) {
      return getChildText('tictactoe.paused')
    }
    if (state.phase === 'won') {
      return getChildText(state.winner === 'x' ? 'tictactoe.star_wins' : 'tictactoe.moon_wins')
    }
    if (state.phase === 'draw') {
      return getChildText('tictactoe.draw')
    }
    if (mode === 'npc' && state.currentPlayer === 'o') {
      return getChildText('tictactoe.npc_thinking')
    }
    if (mode === 'local') {
      return getChildText(state.currentPlayer === 'x' ? 'tictactoe.local_star' : 'tictactoe.local_moon')
    }
    return getChildText(state.currentPlayer === 'x' ? 'tictactoe.star_turn' : 'tictactoe.moon_turn')
  }, [isGamePaused, mode, state.currentPlayer, state.phase, state.winner])

  const feedbackEntry = useMemo(() => {
    if (feedbackOverrideId !== null) {
      return getChildText(feedbackOverrideId)
    }
    if (isGamePaused) {
      return getChildText('tictactoe.paused')
    }
    if (state.phase === 'won') {
      if (mode === 'tutorial') {
        return getChildText('tictactoe.tutorial_done')
      }
      return getChildText(state.winner === 'x' ? 'tictactoe.star_wins' : 'feedback.discovery')
    }
    if (state.phase === 'draw') {
      return getChildText('tictactoe.draw')
    }
    if (mode === 'tutorial') {
      return getChildText(TUTORIAL_ENTRIES[Math.min(tutorialStep, TUTORIAL_ENTRIES.length - 1)]!)
    }
    if (hintLevel > 0) {
      return getChildText(HINT_ENTRIES[Math.min(hintLevel, HINT_ENTRIES.length) - 1]!)
    }
    return getChildText('tictactoe.choose_empty')
  }, [feedbackOverrideId, hintLevel, isGamePaused, mode, state.phase, state.winner, tutorialStep])

  useEffect(() => {
    if (!isHydrated || lastAutomaticSpeechId.current === feedbackEntry.id) {
      return
    }

    if (mode === 'tutorial' || mode === 'local' || state.phase !== 'playing') {
      lastAutomaticSpeechId.current = feedbackEntry.id
      speak(feedbackEntry)
    }
  }, [feedbackEntry, isHydrated, mode, speak, state.phase])

  const suggestedMove = useMemo(() => {
    if (state.phase !== 'playing') {
      return null
    }
    if (mode === 'tutorial') {
      return TUTORIAL_TARGETS[tutorialStep] ?? null
    }
    if (hintLevel < 3 || (mode === 'npc' && state.currentPlayer === 'o')) {
      return null
    }
    return chooseTicTacToeMove(state, 'adult', 20260809 + state.moves.length)
  }, [hintLevel, mode, state, tutorialStep])

  const chooseCell = (move: TicTacToeMove) => {
    if (isGamePaused || state.phase !== 'playing') {
      return
    }
    if (state.board[move] !== null) {
      const entry = getChildText('tictactoe.cell_taken')
      setFeedbackOverrideId(entry.id)
      speak(entry)
      return
    }
    if (mode === 'npc' && state.currentPlayer === 'o') {
      return
    }

    if (mode === 'tutorial') {
      const expectedMove = TUTORIAL_TARGETS[tutorialStep]
      if (move !== expectedMove) {
        const entry = getChildText('tictactoe.tutorial_try_marked')
        setFeedbackOverrideId(entry.id)
      speak(entry)
        return
      }

      let nextState = playTicTacToeMove(state, move)
      const reply = TUTORIAL_REPLIES[tutorialStep]
      if (reply !== null && reply !== undefined && nextState.phase === 'playing') {
        nextState = playTicTacToeMove(nextState, reply)
      }
      setState(nextState)
      setTutorialStep((current) => Math.min(current + 1, TUTORIAL_TARGETS.length))
    } else {
      setState(playTicTacToeMove(state, move))
    }

    setFeedbackOverrideId(null)
    setHintLevel(0)
  }

  const showNextHint = () => {
    if (isGamePaused || state.phase !== 'playing' || (mode === 'npc' && state.currentPlayer === 'o')) {
      return
    }

    const nextLevel = Math.min(hintLevel + 1, HINT_ENTRIES.length)
    const entry = getChildText(HINT_ENTRIES[nextLevel - 1]!)
    setHintLevel(nextLevel)
    setFeedbackOverrideId(null)
    speak(entry)
  }

  const restart = () => {
    void storage.clear(mode).then(() => {
      setState(createModeState(mode))
      setTutorialStep(0)
      setHintLevel(0)
      setIsGamePaused(false)
      setFeedbackOverrideId(mode === 'tutorial' ? 'tictactoe.tutorial_turns' : null)
    })
  }

  const toggleGamePause = () => {
    setIsGamePaused((current) => !current)
    if (isSpeechPaused) {
      togglePause()
    } else if (!isGamePaused) {
      togglePause()
    }
  }

  const changeDifficulty = (level: DifficultyLevel) => {
    setDifficulty(level)
    setFeedbackOverrideId(null)
    speak(getChildText(`difficulty.${level}`))
  }

  const boardIsLocked = isGamePaused ||
    state.phase !== 'playing' ||
    (mode === 'npc' && state.currentPlayer === 'o')

  return (
    <main className={`tictactoe-proposal tictactoe-proposal--${mode}`}>
      <section className="tictactoe-proposal__frame" aria-label={getChildText('tictactoe.title').text_zh_tw}>
        <header className="tictactoe-proposal__header">
          <BopomofoText as="h1" className="tictactoe-proposal__title" entry={getChildText('tictactoe.title')} />
          <BopomofoText className="tictactoe-proposal__badge" entry={getChildText('tictactoe.goal_line')} />
        </header>

        <div className="tictactoe-proposal__layout">
          <section className="tictactoe-board-panel">
            <BopomofoText as="p" className="tictactoe-turn" entry={turnEntry} role="status" />
            <div className="tictactoe-board" role="grid" aria-label={getChildText('tictactoe.title').text_zh_tw}>
              {state.board.map((cell, index) => {
                const move = index as TicTacToeMove
                const entry = cell === 'x'
                  ? getChildText('tictactoe.star_piece')
                  : cell === 'o'
                    ? getChildText('tictactoe.moon_piece')
                    : getChildText('tictactoe.empty_cell')

                return (
                  <button
                    key={move}
                    className={`tictactoe-cell ${cell ? `tictactoe-cell--${cell}` : ''} ${state.winningLine?.includes(move) ? 'tictactoe-cell--winning' : ''}`.trim()}
                    type="button"
                    role="gridcell"
                    aria-label={entry.text_zh_tw}
                    disabled={boardIsLocked || cell !== null}
                    onClick={() => chooseCell(move)}
                  >
                    {cell ? <TicTacToePiece player={cell} /> : null}
                    {cell === null && move === suggestedMove ? <TicTacToeCandidate /> : null}
                  </button>
                )
              })}
            </div>
          </section>

          <aside className="tictactoe-controls">
            <FeedbackCard
              entry={feedbackEntry}
              tone={state.phase === 'playing' && !isGamePaused ? 'hint' : 'positive'}
            />
            <DifficultySelector
              selected={difficulty}
              onChange={changeDifficulty}
            />
            <div className="tictactoe-actions">
              <ChildActionButton
                entry={getChildText('common.hint')}
                icon="hint"
                tone="hint"
                disabled={boardIsLocked}
                onClick={showNextHint}
              />
              <ChildActionButton
                entry={getChildText('tictactoe.play_again')}
                icon="retry"
                tone="secondary"
                onClick={restart}
              />
            </div>
            <div className="tictactoe-tools">
              <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
              <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(feedbackEntry)} />
              <ToolButton
                entry={getChildText(isGamePaused ? 'common.resume' : 'common.pause')}
                icon="pause"
                aria-pressed={isGamePaused || isSpeechPaused}
                onClick={toggleGamePause}
              />
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
