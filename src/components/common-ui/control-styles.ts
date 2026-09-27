import type { CSSProperties } from 'react'

const sharedButtonShape = {
  borderRadius: 'var(--ui-control-radius)',
  gap: 'var(--ui-control-gap)',
} satisfies CSSProperties

export const commonControlButtonStyle = {
  primary: { ...sharedButtonShape, minHeight: 'var(--ui-primary-control-height)' },
  secondary: { ...sharedButtonShape, minHeight: 'var(--ui-secondary-control-height)' },
  hint: { ...sharedButtonShape, minHeight: 'var(--ui-secondary-control-height)' },
  tool: { ...sharedButtonShape, minHeight: 'var(--ui-tool-control-height)' },
  difficulty: { ...sharedButtonShape, minHeight: 'var(--ui-difficulty-control-height)' },
} satisfies Record<'primary' | 'secondary' | 'hint' | 'tool' | 'difficulty', CSSProperties>

export const commonControlIconStyle = {
  width: 'var(--ui-control-icon-size)',
  height: 'var(--ui-control-icon-size)',
} satisfies CSSProperties

export const commonDifficultyIconStyle = {
  width: 'var(--ui-difficulty-icon-size)',
  height: 'var(--ui-difficulty-icon-size)',
} satisfies CSSProperties

export const commonControlLabelStyle = {
  fontSize: 'var(--ui-control-label-size)',
} satisfies CSSProperties
