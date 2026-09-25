import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, FeedbackCard, ToolButton } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { FirebaseFriendPairing } from '../../online/FirebaseFriendPairing'
import { createFirebaseDarkChessSession, type DarkChessOnlineView, type FirebaseDarkChessSession } from '../../online/firebase-dark-chess'
import type { FirebaseRoomFactory } from '../../online/firebase-friend'
import { DarkChessPiece } from './DarkChessPiece'
import { DARK_CHESS_AUTO_DRAW_STEPS, DARK_CHESS_BOARD_CELLS, DARK_CHESS_BOARD_HEIGHT, DARK_CHESS_BOARD_WIDTH, getLegalPublicDarkChessActions, type DarkChessAction, type DarkChessColor, type DarkChessPieceKind } from './rules'

const createOnlineDarkChess: FirebaseRoomFactory<FirebaseDarkChessSession> = createFirebaseDarkChessSession

const pieceEntryIds: Readonly<Record<DarkChessColor, Readonly<Record<DarkChessPieceKind, string>>>> = {
  red: { general: 'dark_chess.red_general', advisor: 'dark_chess.red_advisor', elephant: 'dark_chess.red_elephant', chariot: 'dark_chess.red_chariot', horse: 'dark_chess.red_horse', cannon: 'dark_chess.red_cannon', soldier: 'dark_chess.red_soldier' },
  black: { general: 'dark_chess.black_general', advisor: 'dark_chess.black_advisor', elephant: 'dark_chess.black_elephant', chariot: 'dark_chess.black_chariot', horse: 'dark_chess.black_horse', cannon: 'dark_chess.black_cannon', soldier: 'dark_chess.black_soldier' },
}

export function DarkChessOnlineGame({ onBack }: { onBack: () => void }) {
  const [session, setSession] = useState<FirebaseDarkChessSession | null>(null)
  if (session === null) return <FirebaseFriendPairing<FirebaseDarkChessSession> gameId="dark-chess" roomFactory={createOnlineDarkChess} onBack={onBack} onConnected={setSession} />
  return <DarkChessOnlineBoard session={session} onBack={onBack} />
}

function DarkChessOnlineBoard({ session, onBack }: { session: FirebaseDarkChessSession; onBack: () => void }) {
  const pendingClose = useRef<{ session: FirebaseDarkChessSession; timer: number } | null>(null)
  const [view, setView] = useState<DarkChessOnlineView | null>(null)
  const [connected, setConnected] = useState(false)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState(false)
  const { isSupported, speak } = useSpeech()

  useEffect(() => {
    if (pendingClose.current?.session === session) {
      window.clearTimeout(pendingClose.current.timer)
      pendingClose.current = null
    }
    const unsubscribe = session.subscribe((next) => { setView(next); setSelectedCell(null); setError(false) }, setConnected)
    // StrictMode 初次掛載會立即清理再重新掛載；只在真正離開畫面後關閉房間。
    return () => {
      unsubscribe()
      pendingClose.current = { session, timer: window.setTimeout(() => session.close(), 0) }
    }
  }, [session])

  const state = view?.state
  const legalActions = useMemo(() => state === undefined ? [] : getLegalPublicDarkChessActions(state), [state])
  const myTurn = state !== undefined && (state.currentPlayer === 'player1' ? 'host' : 'guest') === session.role
  const locked = !connected || !myTurn || paused || state?.phase !== 'playing' || state.drawOffer !== null
  const act = (action: DarkChessAction) => {
    if (!view || !connected || !myTurn) return
    void session.submit(action, view.revision).catch(() => setError(true))
  }
  const chooseCell = (cell: number) => {
    if (locked || state === undefined) return
    const flip = legalActions.find((action) => action.kind === 'flip' && action.cell === cell)
    if (flip !== undefined) { act(flip); return }
    const move = selectedCell === null ? undefined : legalActions.find((action) => (action.kind === 'move' || action.kind === 'capture') && action.from === selectedCell && action.to === cell)
    if (move !== undefined) { act(move); return }
    const piece = state.board[cell]
    const color = state.playerColors[state.currentPlayer]
    setSelectedCell(piece?.revealed && color !== null && piece.color === color ? cell : null)
  }
  const restart = () => {
    if (session.role !== 'host' || !connected || view === null) return
    void session.restart(view.revision).catch(() => setError(true))
  }
  const feedback = getChildText(error ? 'online.random_error' : !connected ? 'online.disconnected' : state?.phase === 'won'
    ? state.winner === 'player1' ? 'dark_chess.win' : 'dark_chess.other_win'
    : state?.phase === 'draw' ? 'dark_chess.draw'
      : state !== undefined && state.drawOffer !== null ? 'dark_chess.draw_waiting'
        : state?.playerColors[state.currentPlayer] === null ? 'dark_chess.turn_flip' : 'dark_chess.choose_action')
  const pieceCount = state?.board.filter((piece) => piece !== null).length ?? 0

  return (
    <main className="dark-chess-game" aria-label={getChildText('dark_chess.title').text_zh_tw}>
      <section className="dark-chess-game__frame">
        <section className="dark-chess-game__board-panel">
          <div className="dark-chess-game__board" role="grid" aria-label={getChildText('dark_chess.title').text_zh_tw} aria-rowcount={DARK_CHESS_BOARD_HEIGHT} aria-colcount={DARK_CHESS_BOARD_WIDTH} onContextMenu={(event: MouseEvent<HTMLDivElement>) => event.preventDefault()}>
            {Array.from({ length: DARK_CHESS_BOARD_CELLS }, (_, cell) => {
              const piece = state?.board[cell] ?? null
              const hidden = piece !== null && !piece.revealed
              const entry = piece === null ? getChildText('dark_chess.empty_cell') : hidden || piece.color === null || piece.kind === null ? getChildText('dark_chess.hidden_piece') : getChildText(pieceEntryIds[piece.color][piece.kind])
              const isFlip = legalActions.some((action) => action.kind === 'flip' && action.cell === cell)
              const isTarget = legalActions.some((action) => (action.kind === 'move' || action.kind === 'capture') && action.from === selectedCell && action.to === cell)
              const ownColor = state?.playerColors[state.currentPlayer]
              const selectable = piece?.revealed && piece.color === ownColor
              return <button key={cell} className={['dark-chess-game__cell', hidden ? 'dark-chess-game__cell--hidden' : '', piece?.revealed ? `dark-chess-game__cell--${piece.color}` : '', selectedCell === cell ? 'dark-chess-game__cell--selected' : '', isTarget ? 'dark-chess-game__cell--target' : '', isFlip ? 'dark-chess-game__cell--flip' : ''].filter(Boolean).join(' ')} type="button" role="gridcell" aria-rowindex={Math.floor(cell / DARK_CHESS_BOARD_WIDTH) + 1} aria-colindex={(cell % DARK_CHESS_BOARD_WIDTH) + 1} aria-label={`第 ${cell + 1} 格，${entry.text_zh_tw}`} disabled={locked || !(isFlip || isTarget || selectable)} onClick={() => chooseCell(cell)}>
                {piece === null ? null : <DarkChessPiece color={piece.color ?? undefined} entry={entry} hidden={hidden} />}
                {isFlip ? <span className="dark-chess-game__marker" aria-hidden="true">✦</span> : null}
              </button>
            })}
          </div>
          <p className="dark-chess-game__board-note"><BopomofoText entry={getChildText(state?.playerColors[state.currentPlayer] === null ? 'dark_chess.instruction_flip' : 'dark_chess.choose_action')} /></p>
        </section>
        <aside className="dark-chess-game__controls">
          <header className="dark-chess-game__header"><div className="dark-chess-game__title-row"><BopomofoText as="h1" className="dark-chess-game__title" entry={getChildText('dark_chess.title')} /><span className="dark-chess-game__mode-badge"><BopomofoText className="dark-chess-game__badge" entry={getChildText('online.title')} /></span></div></header>
          <section className="dark-chess-game__status" aria-live="polite"><BopomofoText className="dark-chess-game__turn" role="status" entry={feedback} /><div className="dark-chess-game__stat"><BopomofoText entry={getChildText('dark_chess.quiet_counter')} /><strong>{state?.quietStreak ?? 0}／{DARK_CHESS_AUTO_DRAW_STEPS}</strong></div><div className="dark-chess-game__stat"><BopomofoText entry={getChildText('dark_chess.piece_count')} /><strong>{pieceCount}／32</strong></div></section>
          <FeedbackCard entry={feedback} tone={state?.phase !== 'playing' ? 'positive' : 'hint'} />
          {state !== undefined && state.drawOffer !== null ? <section className="dark-chess-game__draw-response" aria-label={getChildText('dark_chess.draw_waiting').text_zh_tw}><BopomofoText entry={getChildText('dark_chess.draw_waiting')} /><div className="dark-chess-game__actions"><ChildActionButton entry={getChildText('dark_chess.accept_draw')} icon="star" tone="primary" disabled={!connected || !myTurn} onClick={() => act({ kind: 'draw-response', response: 'accept' })} /><ChildActionButton entry={getChildText('dark_chess.continue_game')} icon="retry" tone="secondary" disabled={!connected || !myTurn} onClick={() => act({ kind: 'draw-response', response: 'reject' })} /></div></section> : null}
          <div className="dark-chess-game__actions"><ChildActionButton entry={getChildText('common.hint')} icon="hint" tone="hint" disabled={locked} onClick={() => speak(feedback)} /><ChildActionButton entry={getChildText('dark_chess.offer_draw')} icon="pause" tone="secondary" disabled={locked} onClick={() => act({ kind: 'draw-offer' })} /></div>
          <div className="dark-chess-game__actions dark-chess-game__actions--single"><ChildActionButton entry={getChildText('tictactoe.play_again')} icon="retry" tone="secondary" disabled={session.role !== 'host' || !connected} onClick={restart} /></div>
          <div className="dark-chess-game__tools"><ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} /><ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(feedback)} /><ToolButton entry={getChildText(paused ? 'common.resume' : 'common.pause')} icon="pause" aria-pressed={paused} onClick={() => setPaused((value) => !value)} /></div>
        </aside>
      </section>
    </main>
  )
}
