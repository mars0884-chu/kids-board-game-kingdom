import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import formalArtLandscape from '../../assets/gomoku/ART-006-r04-gomoku-landscape-background.png'
import formalArtPortrait from '../../assets/gomoku/ART-006-r04-gomoku-portrait-background.jpg'
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
import { chooseGomokuMove } from './ai'
import { GomokuAdventure } from './GomokuAdventure'
import { useGomokuBoardKeyboardNavigation } from './board-navigation'
import {
  createGomokuState,
  getGomokuForbiddenReason,
  playGomokuMove,
  replayGomokuMoves,
  type GomokuMove,
  type GomokuState,
} from './rules'
import { indexedDbGomokuStorage, type GomokuMode, type GomokuStorage } from './storage'
import { FirebaseFriendPairing } from '../../online/FirebaseFriendPairing'
import { createFirebaseAuthoritativeTurnSession, type AuthoritativeTurnSession } from '../../online/firebase-authoritative-turn-game'
import { gomokuOnlineRules } from '../../online/turn-rules'
import type { FirebaseRoomFactory } from '../../online/firebase-friend'

const createOnlineGomoku: FirebaseRoomFactory<AuthoritativeTurnSession<GomokuState>> =
  (database, pairing, hostUid, guestUid, signal, expiresAt) =>
    createFirebaseAuthoritativeTurnSession(database, pairing, 'gomoku', hostUid, guestUid, signal, gomokuOnlineRules, expiresAt)

export type { GomokuMode } from './storage'

const formalArtPreviewStorage: GomokuStorage = {
  clear: async () => undefined,
  load: async () => null,
  save: async () => undefined,
}

const formalArtPreviewState = replayGomokuMoves([112, 111, 96, 97, 127, 126, 142, 141])
const formalArtStyle = {
  '--gomoku-formal-art-landscape': `url("${formalArtLandscape}")`,
  '--gomoku-formal-art-portrait': `url("${formalArtPortrait}")`,
} as CSSProperties

interface GomokuProposalProps {
  mode: GomokuMode | 'online'
  onBack: () => void
  storage?: GomokuStorage
  artPreview?: boolean
}

function turnText(state: GomokuState, mode: Exclude<GomokuMode, 'adventure'> | 'online', paused: boolean) {
  if (paused) return getChildText('common.pause')
  if (state.phase === 'won') return getChildText(state.winner === 'black' ? 'gomoku.black_wins' : 'gomoku.white_wins')
  if (state.phase === 'draw') return getChildText('gomoku.draw')
  if (mode === 'npc' && state.currentPlayer === 'white') return getChildText('tictactoe.npc_thinking')
  return getChildText(state.currentPlayer === 'black' ? 'gomoku.black_turn' : 'gomoku.white_turn')
}

export function GomokuProposal({ mode, onBack, storage = indexedDbGomokuStorage, artPreview = false }: GomokuProposalProps) {
  if (artPreview) {
    return (
      <GomokuMatch
        mode="local"
        onBack={onBack}
        storage={formalArtPreviewStorage}
        initialState={formalArtPreviewState}
      />
    )
  }
  if (mode === 'adventure') return <GomokuAdventure onBack={onBack} storage={storage} artStyle={formalArtStyle} />
  return <GomokuMatch mode={mode} onBack={onBack} storage={storage} />
}

interface GomokuMatchProps {
  mode: Exclude<GomokuMode, 'adventure'> | 'online'
  onBack: () => void
  storage: GomokuStorage
  initialState?: GomokuState
}

function GomokuMatch({ mode, onBack, storage, initialState }: GomokuMatchProps) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [state, setState] = useState<GomokuState>(() => initialState ?? createGomokuState())
  const [hintLevel, setHintLevel] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [onlineSession, setOnlineSession] = useState<AuthoritativeTurnSession<GomokuState> | null>(null)
  const [onlineConnected, setOnlineConnected] = useState(false)
  const [feedbackOverrideId, setFeedbackOverrideId] = useState<string | null>(null)
  const { isSupported, speak } = useSpeech()

  useEffect(() => {
    if (mode === 'online') { setIsHydrated(true); return }
    let active = true
    void storage.load(mode).then((session) => {
      if (!active || session === null) return
      setDifficulty(session.difficulty)
      setHintLevel(session.hintLevel)
      setState(session.state)
    }).finally(() => { if (active) setIsHydrated(true) })
    return () => { active = false }
  }, [mode, storage])

  useEffect(() => {
    if (!isHydrated || mode === 'online') return
    void storage.save(mode, { difficulty, hintLevel, state, tutorialStep: 0 })
  }, [difficulty, hintLevel, isHydrated, mode, state, storage])

  useEffect(() => {
    if (onlineSession === null) return
    const unsubscribe = onlineSession.subscribe((next) => { setState(next); setFeedbackOverrideId(null) }, setOnlineConnected)
    return () => { unsubscribe(); onlineSession.close() }
  }, [onlineSession])

  useEffect(() => {
    if (mode !== 'npc' || isPaused || state.phase !== 'playing' || state.currentPlayer !== 'white') return
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.phase !== 'playing' || current.currentPlayer !== 'white') return current
        const move = chooseGomokuMove(current, difficulty, 20260810 + current.moves.length * 97)
        return move === null ? current : playGomokuMove(current, move)
      })
      setFeedbackOverrideId(null)
    }, 380)
    return () => window.clearTimeout(timer)
  }, [difficulty, isPaused, mode, state])

  const feedbackEntry = useMemo(() => {
    if (feedbackOverrideId !== null) return getChildText(feedbackOverrideId)
    if (isPaused) return getChildText('common.pause')
    if (state.phase === 'won') return getChildText(state.winner === 'black' ? 'gomoku.black_wins' : 'gomoku.white_wins')
    if (state.phase === 'draw') return getChildText('gomoku.draw')
    if (hintLevel > 0) return getChildText('gomoku.hint')
    return getChildText('gomoku.choose_empty')
  }, [feedbackOverrideId, hintLevel, isPaused, state.phase, state.winner])

  const suggestedMove = useMemo(() => {
    if (state.phase !== 'playing' || isPaused || (mode === 'npc' && state.currentPlayer === 'white')) return null
    if (hintLevel < 3) return null
    return chooseGomokuMove(state, 'adult', 20260810 + state.moves.length)
  }, [hintLevel, isPaused, mode, state])

  const chooseCell = (move: GomokuMove) => {
    if (isPaused || state.phase !== 'playing' || (mode === 'npc' && state.currentPlayer === 'white')) return
    if (mode === 'online' && (!onlineConnected || onlineSession === null || (state.currentPlayer === 'black' ? 'host' : 'guest') !== onlineSession.role)) return
    if (state.board[move] !== null) {
      const entry = getChildText('gomoku.forbidden')
      setFeedbackOverrideId(entry.id)
      speak(entry)
      return
    }

    const forbiddenReason = getGomokuForbiddenReason(state, move)
    if (forbiddenReason !== null) {
      const entry = getChildText(`gomoku.forbidden_${forbiddenReason}`)
      setFeedbackOverrideId(entry.id)
      speak(entry)
      return
    }

    try {
      const next = playGomokuMove(state, move)
      if (mode === 'online') void onlineSession!.submit(next).catch(() => setFeedbackOverrideId('online.random_error'))
      else setState(next)
      setHintLevel(0)
      setFeedbackOverrideId(null)
    } catch {
      const entry = getChildText('gomoku.forbidden')
      setFeedbackOverrideId(entry.id)
      speak(entry)
    }
  }

  const restart = () => {
    if (mode === 'online') {
      if (onlineSession?.role === 'host') void onlineSession.restart().catch(() => setFeedbackOverrideId('online.random_error'))
      return
    }
    void storage.clear(mode).then(() => {
      setState(initialState ?? createGomokuState())
      setHintLevel(0)
      setIsPaused(false)
      setFeedbackOverrideId(null)
    })
  }

  const showHint = () => {
    if (isPaused || state.phase !== 'playing' || (mode === 'npc' && state.currentPlayer === 'white')) return
    setHintLevel((level) => Math.min(level + 1, 4))
    const entry = getChildText('gomoku.hint')
    setFeedbackOverrideId(entry.id)
    speak(entry)
  }

  const boardLocked = isPaused || state.phase !== 'playing' || (mode === 'npc' && state.currentPlayer === 'white') ||
    (mode === 'online' && (!onlineConnected || onlineSession === null || (state.currentPlayer === 'black' ? 'host' : 'guest') !== onlineSession.role))
  const turnEntry = turnText(state, mode, isPaused)
  const { getCellNavigationProps } = useGomokuBoardKeyboardNavigation({ board: state.board, isLocked: boardLocked })

  if (mode === 'online' && onlineSession === null) {
    return <FirebaseFriendPairing<AuthoritativeTurnSession<GomokuState>> gameId="gomoku" roomFactory={createOnlineGomoku} onBack={onBack} onConnected={setOnlineSession} />
  }

  return (
    <main className="gomoku-proposal gomoku-proposal--formal-r04" style={formalArtStyle}>
      <section className="gomoku-proposal__frame" aria-label={getChildText('gomoku.title').text_zh_tw}>
        <header className="gomoku-proposal__header">
          <BopomofoText as="h1" className="gomoku-proposal__title" entry={getChildText('gomoku.title')} />
          <BopomofoText className="gomoku-proposal__badge" entry={getChildText('gomoku.goal_line')} />
        </header>
        <div className="gomoku-proposal__layout">
          <section className="gomoku-board-panel">
            <BopomofoText as="p" className="gomoku-turn" entry={turnEntry} role="status" />
            <div className="gomoku-board__frame">
              <div className="gomoku-board" role="grid" aria-label={getChildText('gomoku.title').text_zh_tw} aria-rowcount={15} aria-colcount={15}>
                {state.board.map((cell, index) => {
                  const move = index as GomokuMove
                  const entry = cell === 'black'
                    ? getChildText('gomoku.black_piece')
                    : cell === 'white'
                      ? getChildText('gomoku.white_piece')
                      : getChildText('gomoku.empty_cell')
                  return (
                    <button
                      key={move}
                      className={`gomoku-cell ${cell ? `gomoku-cell--${cell}` : ''} ${state.winningLine?.includes(index) ? 'gomoku-cell--winning' : ''} ${suggestedMove === index ? 'gomoku-cell--suggested' : ''}`.trim()}
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
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
          <aside className="gomoku-controls">
            <FeedbackCard entry={feedbackEntry} tone={state.phase === 'playing' && !isPaused ? 'hint' : 'positive'} />
            {mode !== 'online' && <DifficultySelector selected={difficulty} onChange={setDifficulty} />}
            <div className="gomoku-actions">
              <ChildActionButton entry={getChildText('common.hint')} icon="hint" tone="hint" disabled={boardLocked} onClick={showHint} />
              <ChildActionButton entry={getChildText('tictactoe.play_again')} icon="retry" tone="secondary" disabled={mode === 'online' && (onlineSession?.role !== 'host' || !onlineConnected)} onClick={restart} />
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
