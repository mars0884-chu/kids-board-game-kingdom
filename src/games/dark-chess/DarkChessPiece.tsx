import { BopomofoText } from '../../components/BopomofoText'
import type { ChildTextEntry } from '../../content/child-text'
import type { DarkChessColor } from './rules'

interface DarkChessPieceProps {
  readonly color?: DarkChessColor
  readonly entry: ChildTextEntry
  readonly hidden?: boolean
}

function pieceNameEntry(entry: ChildTextEntry): ChildTextEntry {
  const segment = entry.segments.at(-1)
  if (segment === undefined) return entry

  return {
    ...entry,
    text_zh_tw: segment.text,
    segments: [segment],
  }
}

export function DarkChessPiece({ color, entry, hidden = false }: DarkChessPieceProps) {
  if (hidden) {
    return (
      <span className="dark-chess-piece dark-chess-piece--hidden" aria-hidden="true">
        <span className="dark-chess-piece__back-gem" data-back-art="gem-seal">
          <span className="dark-chess-piece__back-gem-core" />
        </span>
        <span className="dark-chess-piece__back-ribbon" />
        <span className="dark-chess-piece__back-ribbon dark-chess-piece__back-ribbon--cross" />
      </span>
    )
  }

  return (
    <span className={`dark-chess-piece dark-chess-piece--${color ?? 'black'}`} aria-hidden="true">
      <span className="dark-chess-piece__rim" />
      <span className="dark-chess-piece__face">
        <BopomofoText entry={pieceNameEntry(entry)} />
      </span>
    </span>
  )
}
