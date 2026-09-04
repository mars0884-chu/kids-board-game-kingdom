import type { ButtonHTMLAttributes } from 'react'
import type { ChildTextEntry } from '../../content/child-text'
import { BopomofoText } from '../BopomofoText'
import { CommonUiIcon, type CommonUiIconName } from './CommonUiIcon'

interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  entry: ChildTextEntry
  icon: CommonUiIconName
}

export function ToolButton({
  entry,
  icon,
  className = '',
  type = 'button',
  ...props
}: ToolButtonProps) {
  return (
    <button className={`child-tool ${className}`.trim()} type={type} {...props}>
      <span className="child-control__icon" aria-hidden="true">
        <CommonUiIcon name={icon} />
      </span>
      <BopomofoText className="child-control__label" entry={entry} />
    </button>
  )
}
