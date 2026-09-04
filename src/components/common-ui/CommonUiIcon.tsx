export type CommonUiIconName =
  | 'star'
  | 'retry'
  | 'hint'
  | 'beginner'
  | 'growth'
  | 'challenge'
  | 'adult'
  | 'target'
  | 'back'
  | 'speaker'
  | 'pause'
  | 'share'
  | 'link'

export function CommonUiIcon({ name }: { name: CommonUiIconName }) {
  if (name === 'star') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="m24 5 5.7 11.6 12.8 1.9-9.2 9 2.2 12.7L24 34.1l-11.5 6.1 2.2-12.7-9.2-9 12.8-1.9z" />
      </svg>
    )
  }

  if (name === 'retry') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M39 16V7l-4 4a17 17 0 1 0 4.8 18" fill="none" />
        <path d="M39 7h-9" fill="none" />
      </svg>
    )
  }

  if (name === 'hint') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M15 21a9 9 0 1 1 18 0c0 5-4 6-5 10h-8c-1-4-5-5-5-10z" fill="none" />
        <path d="M20 36h8M21 41h6M24 3v4M7 21H3m42 0h-4M10 8l3 3m25-3-3 3" fill="none" />
      </svg>
    )
  }

  if (name === 'beginner') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="11" />
      </svg>
    )
  }

  if (name === 'growth') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="m24 8 16 16-16 16L8 24z" />
      </svg>
    )
  }

  if (name === 'challenge') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="m24 8 17 31H7z" />
      </svg>
    )
  }

  if (name === 'adult') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="m7 13 9 9 8-14 8 14 9-9-4 25H11z" />
        <path d="M11 38h26" fill="none" />
      </svg>
    )
  }

  if (name === 'target') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="16" fill="none" />
        <circle cx="24" cy="24" r="7" />
      </svg>
    )
  }

  if (name === 'back') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M40 24H9m12-13L8 24l13 13" fill="none" />
      </svg>
    )
  }

  if (name === 'speaker') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M7 20h9l11-9v26l-11-9H7z" />
        <path d="M33 17c3 4 3 10 0 14m5-19c7 7 7 17 0 24" fill="none" />
      </svg>
    )
  }

  if (name === 'share') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="12" cy="24" r="5" />
        <circle cx="35" cy="12" r="5" />
        <circle cx="35" cy="36" r="5" />
        <path d="m16 22 14-8M16 26l14 8" fill="none" />
      </svg>
    )
  }

  if (name === 'link') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M19 29 29 19M16 35H12a7 7 0 0 1 0-14h7M32 13h4a7 7 0 0 1 0 14h-7" fill="none" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M14 10h7v28h-7zm13 0h7v28h-7z" />
    </svg>
  )
}
