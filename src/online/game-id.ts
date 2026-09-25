/** 配對與房間使用固定棋種識別，不能讓不同遊戲的玩家共用同一局。 */
export const onlineGameIds = [
  'jump-chess',
  'animal-chess',
  'dark-chess',
  'gomoku',
  'number-gem',
  'reversi',
  'tic-tac-toe',
] as const

export type OnlineGameId = typeof onlineGameIds[number]

export function isOnlineGameId(value: unknown): value is OnlineGameId {
  return typeof value === 'string' && onlineGameIds.some((id) => id === value)
}

/** 舊版跳棋配對票沒有 gameId，只能視為跳棋，不能混進其他棋種。 */
export function matchesOnlineGame(value: unknown, expected: OnlineGameId): boolean {
  return (value ?? 'jump-chess') === expected
}
