import type { ButtonHTMLAttributes } from 'react'
import type { ChildTextEntry } from '../../content/child-text'
import { BopomofoText } from '../BopomofoText'
import { CommonUiIcon, type CommonUiIconName } from './CommonUiIcon'
import { commonControlButtonStyle, commonControlIconStyle, commonControlLabelStyle } from './control-styles'

interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  entry: ChildTextEntry
  icon: CommonUiIconName
}

export function ToolButton({
  entry,
  icon,
  className = '',
  style,
  type = 'button',
  ...props
}: ToolButtonProps) {
  return (
    <button
      className={`child-tool ${className}`.trim()}
      data-ui-standard="ART-013-r01"
      data-control-role="tool"
      type={type}
      style={{ ...style, ...commonControlButtonStyle.tool }}
      {...props}
    >
      <span className="child-control__icon" style={commonControlIconStyle} aria-hidden="true">
        <CommonUiIcon name={icon} />
      </span>
      <BopomofoText className="child-control__label" style={commonControlLabelStyle} entry={entry} />
    </button>
  )
}
