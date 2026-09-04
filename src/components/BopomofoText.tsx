import type { ElementType, HTMLAttributes } from 'react'
import type { ChildTextEntry, ChildTextSegment } from '../content/child-text'

interface BopomofoTextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  entry: ChildTextEntry
}

const toneMarks = new Set(['ˊ', 'ˇ', 'ˋ', '˙'])

const splitReading = (reading: string) => {
  const characters = Array.from(reading.normalize('NFC'))
  const tone = characters.find((character) => toneMarks.has(character)) ?? ''
  const symbols = characters.filter((character) => !toneMarks.has(character)).join('')

  return { symbols, tone }
}

function BopomofoPair({ segment }: { segment: ChildTextSegment }) {
  if (!segment.bopomofo) {
    return (
      <span className="bopomofo-text__punctuation" aria-hidden="true">
        {segment.text}
      </span>
    )
  }

  const { symbols, tone } = splitReading(segment.bopomofo)
  const symbolCountClass = symbols.length === 1
    ? 'bopomofo-pair__annotation--single'
    : symbols.length === 2
      ? 'bopomofo-pair__annotation--double'
      : symbols.length === 3
        ? 'bopomofo-pair__annotation--triple'
        : 'bopomofo-pair__annotation--many'
  const toneCountClass = symbols.length === 1
    ? 'bopomofo-pair__tone--single'
    : symbols.length === 2
      ? 'bopomofo-pair__tone--double'
      : symbols.length === 3
        ? 'bopomofo-pair__tone--triple'
        : 'bopomofo-pair__tone--many'
  const toneClass = tone === '˙' ? 'bopomofo-pair__tone--neutral' : ''
  const annotationClass = tone === '˙'
    ? 'bopomofo-pair__annotation--neutral'
    : tone === ''
      ? 'bopomofo-pair__annotation--unmarked'
      : ''

  return (
    <span
      className="bopomofo-pair"
      aria-hidden="true"
      data-bopomofo-pair
      data-bopomofo-layout="hanzi-right-vertical"
    >
      <span className="bopomofo-pair__hanzi">{segment.text}</span>
      <span className={`bopomofo-pair__annotation ${annotationClass} ${symbolCountClass}`.trim()}>
        <span
          className={`bopomofo-pair__symbols ${tone === '˙' ? 'bopomofo-pair__symbols--neutral' : ''} ${symbolCountClass.replace('__annotation', '__symbols')}`.trim()}
        >
          {symbols}
        </span>
        {tone && (
          <span className={`bopomofo-pair__tone ${toneClass} ${toneCountClass}`.trim()}>{tone}</span>
        )}
      </span>
    </span>
  )
}

export function BopomofoText({
  as: Component = 'span',
  className = '',
  entry,
  ...props
}: BopomofoTextProps) {
  return (
    <Component
      className={`bopomofo-text ${className}`.trim()}
      aria-label={entry.text_zh_tw}
      {...props}
    >
      {entry.segments.map((segment, index) => (
        <BopomofoPair key={`${entry.id}-${index}`} segment={segment} />
      ))}
    </Component>
  )
}
