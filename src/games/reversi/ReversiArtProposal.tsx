import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton, DifficultySelector, FeedbackCard, ToolButton, type DifficultyLevel } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { chooseReversiMove } from './ai'
import { applyReversiMove, createReversiState, getLegalReversiMoves, type ReversiMove } from './rules'
import type { ReversiMode } from './storage'

interface ReversiArtProposalProps {
  onBack: () => void
  /** 預覽網址維持 local 預設；首頁入口會明確傳入三種兒童模式。 */
  mode?: ReversiMode
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

export function ReversiArtProposal({ onBack, mode = 'local' }: ReversiArtProposalProps) {
  const [state, setState] = useState(createReversiState)
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const [isGamePaused, setIsGamePaused] = useState(false)
  const [activeMove, setActiveMove] = useState<ReversiMove>(19)
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])
  const { isPaused: isSpeechPaused, isSupported, speak, togglePause } = useSpeech()
  const legalMoves = useMemo(() => getLegalReversiMoves(state), [state])
  const isNpcTurn = mode !== 'local' && !isGamePaused && state.phase === 'playing' && state.currentPlayer === 'white'
  const boardLocked = isGamePaused || state.phase !== 'playing' || isNpcTurn
  const npcDifficulty: DifficultyLevel = mode === 'adventure' ? 'beginner' : difficulty

  useEffect(() => {
    if (legalMoves.includes(activeMove)) return
    setActiveMove(legalMoves[0] ?? 0)
  }, [activeMove, legalMoves])

  useEffect(() => {
    if (!isNpcTurn) return
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.phase !== 'playing' || current.currentPlayer !== 'white') return current
        const move = chooseReversiMove(current, npcDifficulty, 20260816 + current.turns.length * 97)
        return move === null ? current : applyReversiMove(current, move)
      })
    }, 420)
    return () => window.clearTimeout(timer)
  }, [isNpcTurn, npcDifficulty, state])

  const restart = () => {
    setState(createReversiState())
    setActiveMove(19)
    setIsGamePaused(false)
  }

  const toggleGamePause = () => {
    setIsGamePaused((current) => !current)
    if (isSpeechPaused) {
      togglePause()
    } else if (!isGamePaused) {
      togglePause()
    }
  }

  const chooseCell = (move: ReversiMove) => {
    if (boardLocked || !legalMoves.includes(move)) return
    setState((current) => applyReversiMove(current, move))
  }

  const onCellKeyDown = (move: ReversiMove, event: KeyboardEvent<HTMLButtonElement>) => {
    if (boardLocked) return
    const nextMove = findNextMove(move, legalMoves, event.key)
    if (nextMove === null) return
    event.preventDefault()
    setActiveMove(nextMove)
    cellRefs.current[nextMove]?.focus()
  }

  const latestTurn = state.turns[state.turns.length - 1]
  const blackEntry = getChildText('reversi.black_piece')
  const whiteEntry = getChildText('reversi.white_piece')
  const blackTurnEntry = getChildText(state.turns.length === 0 ? 'reversi.turn_black' : 'reversi.turn_black_next')
  const whiteTurnEntry = getChildText('reversi.turn_white')
  const resultEntry = state.winner === 'black'
    ? getChildText('reversi.result_black')
    : state.winner === 'white'
      ? getChildText('reversi.result_white')
      : getChildText('reversi.result_draw')
  const feedback = state.phase !== 'playing'
    ? resultEntry
    : isGamePaused
      ? getChildText('common.pause')
    : latestTurn?.kind === 'pass'
      ? getChildText('reversi.forced_pass')
      : mode === 'adventure'
        ? isNpcTurn
          ? getChildText('reversi.npc_thinking')
          : state.turns.length === 0
            ? getChildText('reversi.tutorial_start')
            : getChildText('reversi.tutorial_after_move')
        : mode === 'npc'
          ? isNpcTurn
            ? getChildText('reversi.npc_thinking')
            : getChildText('reversi.choose_move')
          : getChildText(state.currentPlayer === 'black' ? 'reversi.flip_hint' : 'reversi.flip_hint_white')
  const turnEntry = state.phase !== 'playing'
    ? resultEntry
    : isNpcTurn
      ? getChildText('reversi.npc_thinking')
      : state.currentPlayer === 'black' ? blackTurnEntry : whiteTurnEntry
  const feedbackTone = state.phase !== 'playing' || latestTurn?.kind === 'pass' ? 'positive' : 'hint'
  const activePlayer = state.phase === 'playing' ? state.currentPlayer : null
  const modeEntry = getChildText(mode === 'adventure'
    ? 'reversi.mode_adventure'
    : mode === 'npc'
      ? 'reversi.mode_practice'
      : 'reversi.mode_local')

  return (
    <main className="reversi-art-proposal" aria-label={getChildText('reversi.title').text_zh_tw}>
      <section className="reversi-art-proposal__frame">
        <section className="reversi-art-proposal__board-panel">
          <div className="reversi-board" role="grid" aria-label={getChildText('reversi.title').text_zh_tw} aria-rowcount={8} aria-colcount={8}>
            {state.board.map((cell, index) => {
              const move = index as ReversiMove
              const isLegal = legalMoves.includes(move)
              const pieceEntry = cell === 'black' ? blackEntry : cell === 'white' ? whiteEntry : null
              return (
                <button
                  key={move}
                  ref={(element) => { cellRefs.current[move] = element }}
                  className={`reversi-cell ${cell ? `reversi-cell--${cell}` : ''} ${isLegal ? 'reversi-cell--legal' : ''}`.trim()}
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
              <BopomofoText as="h1" className="reversi-art-proposal__title" entry={getChildText('reversi.title')} />
              <div className="reversi-art-proposal__badges">
                <BopomofoText className="reversi-art-proposal__badge" entry={getChildText('reversi.flip_badge')} />
                <BopomofoText className="reversi-art-proposal__mode" entry={modeEntry} />
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
          <FeedbackCard entry={feedback} tone={feedbackTone} />
          {mode === 'npc' ? <DifficultySelector selected={difficulty} onChange={setDifficulty} /> : null}
          <div className="reversi-art-proposal__actions">
            <ChildActionButton entry={getChildText('common.hint')} icon="hint" tone="hint" disabled={boardLocked} onClick={() => speak(feedback)} />
            <ChildActionButton entry={getChildText('tictactoe.play_again')} icon="retry" tone="secondary" onClick={restart} />
          </div>
          <div className="reversi-art-proposal__tools">
            <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
            <ToolButton entry={getChildText('common.listen')} icon="speaker" disabled={!isSupported} onClick={() => speak(feedback)} />
            <ToolButton entry={getChildText(isGamePaused ? 'common.resume' : 'common.pause')} icon="pause" aria-pressed={isGamePaused || isSpeechPaused} onClick={toggleGamePause} />
          </div>
        </aside>
      </section>
    </main>
  )
}
