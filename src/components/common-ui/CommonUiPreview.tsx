import { useState } from 'react'
import { getChildText } from '../../content/child-text'
import { useSpeech } from '../../hooks/useSpeech'
import { BopomofoText } from '../BopomofoText'
import { ChildActionButton } from './ChildActionButton'
import { DifficultySelector, type DifficultyLevel } from './DifficultySelector'
import { FeedbackCard } from './FeedbackCard'
import { ToolButton } from './ToolButton'

interface CommonUiPreviewProps {
  onBack: () => void
}

export function CommonUiPreview({ onBack }: CommonUiPreviewProps) {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner')
  const { isSupported, speak, togglePause } = useSpeech()

  const speakEntry = (textId: string) => {
    if (isSupported) {
      speak(getChildText(textId))
    }
  }

  return (
    <main className="common-ui-preview" aria-labelledby="common-ui-preview-title">
      <div className="common-ui-board">
        <div className="common-ui-board__topline">
          <BopomofoText
            as="h1"
            className="common-ui-board__title"
            entry={getChildText('ui.common_title')}
            id="common-ui-preview-title"
          />
          <BopomofoText
            className="common-ui-board__badge"
            entry={getChildText('ui.bopomofo_ready')}
          />
        </div>

        <div className="common-ui-board__grid">
          <section className="common-ui-section" aria-labelledby="common-actions-title">
            <BopomofoText
              as="h2"
              className="common-ui-section__title"
              entry={getChildText('ui.main_actions')}
              id="common-actions-title"
            />
            <div className="common-ui-actions">
              <ChildActionButton
                entry={getChildText('home.start')}
                icon="star"
                tone="primary"
                onClick={() => speakEntry('home.start')}
              />
              <ChildActionButton
                entry={getChildText('common.try_again')}
                icon="retry"
                tone="secondary"
                onClick={() => speakEntry('feedback.discovery')}
              />
              <ChildActionButton
                entry={getChildText('common.hint')}
                icon="hint"
                tone="hint"
                onClick={() => speakEntry('feedback.hint_center')}
              />
            </div>
          </section>

          <section className="common-ui-section" aria-labelledby="common-difficulty-title">
            <BopomofoText
              as="h2"
              className="common-ui-section__title"
              entry={getChildText('ui.choose_difficulty')}
              id="common-difficulty-title"
            />
            <DifficultySelector selected={difficulty} onChange={setDifficulty} />
          </section>

          <section className="common-ui-section" aria-labelledby="common-feedback-title">
            <BopomofoText
              as="h2"
              className="common-ui-section__title"
              entry={getChildText('ui.feedback_title')}
              id="common-feedback-title"
            />
            <div className="common-ui-feedbacks">
              <FeedbackCard entry={getChildText('feedback.hint_center')} tone="hint" />
              <FeedbackCard entry={getChildText('feedback.discovery')} tone="positive" />
            </div>
          </section>

          <section className="common-ui-section" aria-labelledby="common-tools-title">
            <BopomofoText
              as="h2"
              className="common-ui-section__title"
              entry={getChildText('ui.tools_title')}
              id="common-tools-title"
            />
            <div className="common-ui-tools">
              <ToolButton entry={getChildText('common.back')} icon="back" onClick={onBack} />
              <ToolButton
                entry={getChildText('common.listen')}
                icon="speaker"
                onClick={() => speakEntry('ui.preview_speech')}
              />
              <ToolButton entry={getChildText('common.pause')} icon="pause" onClick={togglePause} />
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
