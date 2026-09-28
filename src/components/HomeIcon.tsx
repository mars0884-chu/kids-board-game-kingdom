export type HomeIconName = 'castle' | 'puzzle' | 'friends' | 'board' | 'speaker' | 'adult' | 'tic-tac-toe' | 'number-gem' | 'animal-chess' | 'gomoku' | 'reversi' | 'dark-chess' | 'jump-chess' | 'xiangqi' | 'go'

export function HomeIcon({ name }: { name: HomeIconName }) {
  if (name === 'tic-tac-toe') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M18 7v34M30 7v34M7 18h34M7 30h34" fill="none" />
        <circle cx="13" cy="13" r="4" fill="none" />
        <path d="m23 22 5 5m0-5-5 5m7 8h7" fill="none" />
      </svg>
    )
  }

  if (name === 'number-gem') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="m24 5 17 14-17 24L7 19z" fill="none" />
        <path d="M7 19h34M17 19l7 24m7-24-7 24" fill="none" />
        <circle cx="24" cy="13" r="2.5" />
      </svg>
    )
  }

  if (name === 'animal-chess') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="12" cy="13" r="4" />
        <circle cx="24" cy="9" r="4" />
        <circle cx="36" cy="13" r="4" />
        <circle cx="9" cy="25" r="4" />
        <circle cx="39" cy="25" r="4" />
        <path d="M14 37c0-7 4-12 10-12s10 5 10 12c0 4-4 5-10 3-6 2-10 1-10-3z" />
      </svg>
    )
  }

  if (name === 'gomoku') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M8 9h32M8 24h32M8 39h32M9 8v32M24 8v32M39 8v32" fill="none" />
        <circle cx="9" cy="24" r="3.5" />
        <circle cx="17" cy="24" r="3.5" />
        <circle cx="25" cy="24" r="3.5" />
        <circle cx="33" cy="24" r="3.5" />
        <circle cx="41" cy="24" r="3.5" />
      </svg>
    )
  }

  if (name === 'reversi') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M8 13h32v22H8zM19 13v22M29 13v22M8 24h32" fill="none" />
        <circle cx="19" cy="24" r="6" />
        <circle cx="29" cy="24" r="6" fill="none" />
      </svg>
    )
  }

  if (name === 'dark-chess') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M12 6h19l7 7v29H12zM31 6v9h8" fill="none" />
        <path d="M20 21a5 5 0 1 1 7 4c-2 1-3 2-3 5m0 6h.1" fill="none" />
      </svg>
    )
  }

  if (name === 'jump-chess') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M8 36 21 13l7 13 12-17M10 39h28" fill="none" />
        <circle cx="8" cy="36" r="4" />
        <circle cx="21" cy="13" r="4" />
        <circle cx="28" cy="26" r="4" />
        <circle cx="40" cy="9" r="4" />
      </svg>
    )
  }

  if (name === 'xiangqi') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="m7 18 9-8 8 8 8-8 9 8v5H7zM11 23v16m26-16v16M8 39h32" fill="none" />
        <circle cx="24" cy="30" r="6" fill="none" />
        <path d="M24 26v8m-4-4h8" fill="none" />
      </svg>
    )
  }

  if (name === 'go') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M9 9h30M9 24h30M9 39h30M9 9v30M24 9v30M39 9v30" fill="none" />
        <circle cx="24" cy="24" r="5" />
        <circle cx="9" cy="9" r="2.5" />
        <circle cx="39" cy="39" r="2.5" />
      </svg>
    )
  }

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
