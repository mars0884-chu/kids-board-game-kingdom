type HomeIconName = 'castle' | 'puzzle' | 'friends' | 'board' | 'speaker' | 'adult'

export function HomeIcon({ name }: { name: HomeIconName }) {
  if (name === 'castle') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M7 19h8v-7h6v7h6v-7h6v7h8v22H7z" />
        <path d="M18 41V30a6 6 0 0 1 12 0v11M11 12V6l8 3-8 3zm22 0V6l8 3-8 3z" fill="none" />
      </svg>
    )
  }

  if (name === 'puzzle') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M8 8h13a6 6 0 1 0 10 0h9v13a6 6 0 1 0 0 10v9H29a6 6 0 1 0-10 0H8V29a6 6 0 1 0 0-10z" />
      </svg>
    )
  }

  if (name === 'friends') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="17" cy="17" r="7" />
        <circle cx="33" cy="19" r="6" />
        <path d="M5 42c0-9 5-15 12-15s12 6 12 15m-4-9c2-5 5-8 9-8 6 0 10 6 10 15" fill="none" />
      </svg>
    )
  }

  if (name === 'board') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <rect x="7" y="7" width="34" height="34" rx="4" fill="none" />
        <path d="M18 7v34M30 7v34M7 18h34M7 30h34" fill="none" />
        <circle cx="18" cy="18" r="3.2" />
        <circle cx="30" cy="30" r="3.2" />
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

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="15" r="8" />
      <path d="M10 41c1-10 6-15 14-15s13 5 14 15" />
    </svg>
  )
}
