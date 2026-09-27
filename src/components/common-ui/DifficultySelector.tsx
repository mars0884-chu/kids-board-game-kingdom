import { BopomofoText } from '../BopomofoText'
import { getChildText } from '../../content/child-text'
import { CommonUiIcon, type CommonUiIconName } from './CommonUiIcon'
import { commonControlButtonStyle, commonControlLabelStyle, commonDifficultyIconStyle } from './control-styles'

export type DifficultyLevel = 'beginner' | 'growth' | 'challenge' | 'adult'

interface DifficultyOption {
  icon: CommonUiIconName
  level: DifficultyLevel
  textId: string
}

const difficultyOptions: readonly DifficultyOption[] = [
  { level: 'beginner', textId: 'difficulty.beginner', icon: 'beginner' },
  { level: 'growth', textId: 'difficulty.growth', icon: 'growth' },
  { level: 'challenge', textId: 'difficulty.challenge', icon: 'challenge' },
  { level: 'adult', textId: 'difficulty.adult', icon: 'adult' },
]

interface DifficultySelectorProps {
  disabled?: boolean
  onChange: (level: DifficultyLevel) => void
  selected: DifficultyLevel
}

export function DifficultySelector({ disabled = false, onChange, selected }: DifficultySelectorProps) {
  const selectedOption = difficultyOptions.find((option) => option.level === selected)

  if (!selectedOption) {
    throw new Error(`不支援的難度：${selected}`)
  }

  const currentEntry = getChildText('difficulty.current')
  const selectedEntry = getChildText(selectedOption.textId)

  return (
    <>
      <div
        className="difficulty-selector"
        data-ui-standard="ART-013-r01"
        data-control-group="difficulty"
        role="group"
        aria-label={getChildText('ui.choose_difficulty').text_zh_tw}
      >
        {difficultyOptions.map((option) => {
          const entry = getChildText(option.textId)
          const isSelected = option.level === selected

          return (
            <button
              key={option.level}
              className={`difficulty-option difficulty-option--${option.level}`}
              type="button"
              aria-label={entry.text_zh_tw}
              aria-pressed={isSelected}
              disabled={disabled}
              data-ui-standard="ART-013-r01"
              data-control-role="difficulty"
              style={commonControlButtonStyle.difficulty}
              onClick={() => onChange(option.level)}
            >
              <span className="difficulty-option__icon" style={commonDifficultyIconStyle} aria-hidden="true">
                <CommonUiIcon name={option.icon} />
              </span>
              <BopomofoText className="child-control__label" style={commonControlLabelStyle} entry={entry} />
            </button>
          )
        })}
      </div>
      <div
        className="difficulty-status"
        role="status"
        aria-label={`${currentEntry.text_zh_tw}${selectedEntry.text_zh_tw}`}
        aria-live="polite"
      >
        <BopomofoText entry={currentEntry} />
        <BopomofoText entry={selectedEntry} />
      </div>
    </>
  )
}
