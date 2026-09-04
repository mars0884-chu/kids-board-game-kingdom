import type { ButtonHTMLAttributes } from 'react'
import type { ChildTextEntry } from '../../content/child-text'
import { BopomofoText } from '../BopomofoText'
import { CommonUiIcon, type CommonUiIconName } from './CommonUiIcon'

export type ChildActionTone = 'primary' | 'secondary' | 'hint'

interface ChildActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  entry: ChildTextEntry
  icon: CommonUiIconName
  tone: ChildActionTone
}

export function ChildActionButton({
  entry,
  icon,
  tone,
  className = '',
  type = 'button',
  ...props
}: ChildActionButtonProps) {
  return (
    <button
      className={`child-action child-action--${tone} ${className}`.trim()}
      type={type}
      {...props}
    >
      <span className="child-control__icon" aria-hidden="true">
        <CommonUiIcon name={icon} />
      </span>
      <BopomofoText className="child-control__label" entry={entry} />
    </button>
  )
}
