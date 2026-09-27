import type { ButtonHTMLAttributes } from 'react'
import type { ChildTextEntry } from '../../content/child-text'
import { BopomofoText } from '../BopomofoText'
import { CommonUiIcon, type CommonUiIconName } from './CommonUiIcon'
import { commonControlButtonStyle, commonControlIconStyle, commonControlLabelStyle } from './control-styles'

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
  style,
  type = 'button',
  ...props
}: ChildActionButtonProps) {
  return (
    <button
      className={`child-action child-action--${tone} ${className}`.trim()}
      data-ui-standard="ART-013-r01"
      data-control-role={tone}
      type={type}
      style={{ ...style, ...commonControlButtonStyle[tone] }}
      {...props}
    >
      <span className="child-control__icon" style={commonControlIconStyle} aria-hidden="true">
        <CommonUiIcon name={icon} />
      </span>
      <BopomofoText className="child-control__label" style={commonControlLabelStyle} entry={entry} />
    </button>
  )
}
