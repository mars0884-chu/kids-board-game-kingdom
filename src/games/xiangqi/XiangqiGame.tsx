import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BopomofoText } from '../../components/BopomofoText'
import { ChildActionButton } from '../../components/common-ui'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { applyMove, createInitialXiangqiState, getLegalMovesFrom, type XiangqiKind, type XiangqiPlayer, type XiangqiState } from './rules'
import './XiangqiGame.css'

interface XiangqiGameProps { onBack: () => void }

const names: Record<XiangqiPlayer, Record<XiangqiKind, string>> = {
  red: { king: '帥', advisor: '仕', elephant: '相', horse: '馬', chariot: '車', cannon: '炮', soldier: '兵' },
  black: { king: '將', advisor: '士', elephant: '象', horse: '馬', chariot: '車', cannon: '炮', soldier: '卒' },
}

export function XiangqiGame({ onBack }: XiangqiGameProps) {
  const [state, setState] = useState<XiangqiState>(() => createInitialXiangqiState())
  const [selected, setSelected] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const boardWrapRef = useRef<HTMLDivElement>(null)
  const pinchRef = useRef<{ distance: number; zoom: number; focusX: number; focusY: number } | null>(null)
  const pendingScrollRef = useRef<{ x: number; y: number; left: number; top: number; scale: number } | null>(null)
  const { speak } = useSpeech()
  const destinations = useMemo(() => selected === null ? [] : getLegalMovesFrom(state, selected), [state, selected])
  const selectedPiece = selected === null ? null : state.board[selected]
  const statusId = state.phase === 'won' ? state.winner === 'red' ? 'xiangqi.red_wins' : 'xiangqi.black_wins'
    : state.phase === 'draw' ? 'xiangqi.draw'
      : state.phase === 'check' ? 'xiangqi.check'
        : state.currentPlayer === 'red' ? 'xiangqi.red_turn' : 'xiangqi.black_turn'

  useLayoutEffect(() => {
    const wrap = boardWrapRef.current
    const pending = pendingScrollRef.current
    if (!wrap || !pending) return
    wrap.scrollLeft = (pending.left + pending.x) * pending.scale - pending.x
    wrap.scrollTop = (pending.top + pending.y) * pending.scale - pending.y
    pendingScrollRef.current = null
  }, [zoom])

  useLayoutEffect(() => {
    const wrap = boardWrapRef.current
    if (!wrap) return
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
    const midpoint = (touches: TouchList) => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 })
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 2) return
      event.preventDefault()
      const point = midpoint(event.touches)
      const rect = wrap.getBoundingClientRect()
      pinchRef.current = { distance: distance(event.touches), zoom, focusX: point.x - rect.left, focusY: point.y - rect.top }
    }
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinchRef.current) return
      event.preventDefault()
      const next = Math.min(2.2, Math.max(1, pinchRef.current.zoom * distance(event.touches) / Math.max(1, pinchRef.current.distance)))
      if (Math.abs(next - zoom) < 0.01) return
      pendingScrollRef.current = { x: pinchRef.current.focusX, y: pinchRef.current.focusY, left: wrap.scrollLeft, top: wrap.scrollTop, scale: next / zoom }
      setZoom(next)
    }
    const end = (event: TouchEvent) => { if (event.touches.length < 2) pinchRef.current = null }
    wrap.addEventListener('touchstart', start, { passive: false })
    wrap.addEventListener('touchmove', move, { passive: false })
    wrap.addEventListener('touchend', end)
    wrap.addEventListener('touchcancel', end)
    return () => {
      wrap.removeEventListener('touchstart', start)
      wrap.removeEventListener('touchmove', move)
      wrap.removeEventListener('touchend', end)
      wrap.removeEventListener('touchcancel', end)
    }
  }, [zoom])

  function selectCell(index: number) {
    if (state.phase === 'won' || state.phase === 'draw') return
    const piece = state.board[index]
    if (destinations.some((move) => move.to === index) && selected !== null) {
      const next = applyMove(state, selected, index)
      setState(next)
      setSelected(null)
      const nextStatus = next.phase === 'won' ? next.winner === 'red' ? 'xiangqi.red_wins' : 'xiangqi.black_wins'
        : next.phase === 'draw' ? 'xiangqi.draw' : next.phase === 'check' ? 'xiangqi.check' :
          next.currentPlayer === 'red' ? 'xiangqi.red_turn' : 'xiangqi.black_turn'
      speak(getChildText(nextStatus))
      return
    }
    setSelected(piece?.owner === state.currentPlayer ? index : null)
    if (piece?.owner === state.currentPlayer) speak(getChildText(`xiangqi.piece_${names[piece.owner][piece.kind]}`))
  }

  return <main className="xiangqi-game">
    <section className="xiangqi-game__frame" aria-label={getChildText('xiangqi.title').text_zh_tw}>
      <header className="xiangqi-game__header">
        <BopomofoText as="h1" entry={getChildText('xiangqi.title')} />
        <div className={`xiangqi-game__turn-card xiangqi-game__turn-card--${state.currentPlayer}`}>
          <svg className="xiangqi-game__turn-emblem" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path d="M6 19 24 7l18 12v21H6V19Z" fill="currentColor" opacity=".14" />
            <path d="M8 19 24 8l16 11M10 20v19h28V20M16 35V23l8-5 8 5v12M12 28h6m12 0h6M21 39V27h6v12" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <BopomofoText className="xiangqi-game__status" as="p" entry={getChildText(statusId)} />
        </div>
        {selectedPiece && <BopomofoText className="xiangqi-game__selection" as="p" entry={getChildText(`xiangqi.piece_${names[selectedPiece.owner][selectedPiece.kind]}`)} />}
      </header>
      <div ref={boardWrapRef} className={"xiangqi-game__board-wrap" + (zoom > 1.01 ? " xiangqi-game__board-wrap--zoomed" : "")} style={{ '--xiangqi-zoom': zoom } as React.CSSProperties}>
        <div className="xiangqi-game__board" role="grid" aria-label={getChildText('xiangqi.title').text_zh_tw} style={{ width: `${zoom * 100}%` }}>
          <svg className="xiangqi-game__lines" viewBox="0 0 400 450" preserveAspectRatio="none" aria-hidden="true">
            {Array.from({ length: 10 }, (_, row) => <line key={`r${row}`} x1="0" y1={row * 50} x2="400" y2={row * 50} />)}
            {Array.from({ length: 9 }, (_, col) => <g key={`c${col}`}><line x1={col * 50} y1="0" x2={col * 50} y2="200" /><line x1={col * 50} y1="250" x2={col * 50} y2="450" /></g>)}
            <line x1="150" y1="0" x2="250" y2="100" /><line x1="250" y1="0" x2="150" y2="100" />
            <line x1="150" y1="350" x2="250" y2="450" /><line x1="250" y1="350" x2="150" y2="450" />
          </svg>
          <BopomofoText className="xiangqi-game__river" entry={getChildText('xiangqi.river')} />
          {state.board.map((piece, index) => {
            const row = Math.floor(index / 9)
            const col = index % 9
            const isDestination = destinations.some((move) => move.to === index)
            return <button key={index} type="button" role="gridcell"
              className={`xiangqi-game__cell${piece ? ` xiangqi-game__cell--${piece.owner}` : ''}${selected === index ? ' xiangqi-game__cell--selected' : ''}${isDestination ? ' xiangqi-game__cell--destination' : ''}`}
              style={{ left: `${col * 12.5}%`, top: `${row * (100 / 9)}%` }}
              aria-label={piece ? `${piece.owner === 'red' ? '紅' : '黑'}${names[piece.owner][piece.kind]}，${row + 1}列${col + 1}行` : `${row + 1}列${col + 1}行${isDestination ? '，可走' : ''}`}
              aria-selected={selected === index}
              onClick={() => selectCell(index)}>
              {piece && <BopomofoText entry={getChildText(`xiangqi.piece_${names[piece.owner][piece.kind]}`)} />}
              {!piece && isDestination && <span aria-hidden="true" className="xiangqi-game__target">✦</span>}
            </button>
          })}
        </div>
      </div>
      <nav className="xiangqi-game__actions">
        <ChildActionButton entry={getChildText('common.back')} icon="back" tone="secondary" onClick={onBack} />
        <ChildActionButton entry={getChildText('common.try_again')} icon="retry" tone="primary" onClick={() => { setState(createInitialXiangqiState()); setSelected(null) }} />
      </nav>
    </section>
  </main>
}
