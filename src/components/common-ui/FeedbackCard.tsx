import type { ChildTextEntry } from '../../content/child-text'
import { BopomofoText } from '../BopomofoText'
import { CommonUiIcon } from './CommonUiIcon'

export type FeedbackTone = 'hint' | 'positive'

interface FeedbackCardProps {
  entry: ChildTextEntry
  tone: FeedbackTone
}

export function FeedbackCard({ entry, tone }: FeedbackCardProps) {
  return (
    <article className={`feedback-card feedback-card--${tone}`} aria-live="polite" aria-atomic="true">
      <span className="feedback-card__icon" aria-hidden="true">
        <CommonUiIcon name={tone === 'hint' ? 'target' : 'star'} />
      </span>
      <BopomofoText className="feedback-card__message" entry={entry} />
    </article>
  )
}
