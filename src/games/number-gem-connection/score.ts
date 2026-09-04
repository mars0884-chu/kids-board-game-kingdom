export const NUMBER_GEM_LOCAL_QUESTIONS = 3

export type NumberGemLocalPlayer = 1 | 2

export interface NumberGemScore {
  stars: number
  localStars: Record<NumberGemLocalPlayer, number>
  localQuestions: Record<NumberGemLocalPlayer, number>
}

export function createInitialNumberGemScore(): NumberGemScore {
  return {
    stars: 0,
    localStars: { 1: 0, 2: 0 },
    localQuestions: { 1: 0, 2: 0 },
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function normalizeNumberGemScore(value: unknown): NumberGemScore | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const localStars = candidate.localStars
  const localQuestions = candidate.localQuestions
  if (typeof localStars !== 'object' || localStars === null || Array.isArray(localStars)) return null
  if (typeof localQuestions !== 'object' || localQuestions === null || Array.isArray(localQuestions)) return null

  const stars = candidate.stars
  const playerOneStars = (localStars as Record<string, unknown>)['1']
  const playerTwoStars = (localStars as Record<string, unknown>)['2']
  const playerOneQuestions = (localQuestions as Record<string, unknown>)['1']
  const playerTwoQuestions = (localQuestions as Record<string, unknown>)['2']
  if (!isNonNegativeInteger(stars)
    || !isNonNegativeInteger(playerOneStars)
    || !isNonNegativeInteger(playerTwoStars)
    || !isNonNegativeInteger(playerOneQuestions)
    || !isNonNegativeInteger(playerTwoQuestions)
    || playerOneQuestions > NUMBER_GEM_LOCAL_QUESTIONS
    || playerTwoQuestions > NUMBER_GEM_LOCAL_QUESTIONS) {
    return null
  }

  return {
    stars,
    localStars: { 1: playerOneStars, 2: playerTwoStars },
    localQuestions: { 1: playerOneQuestions, 2: playerTwoQuestions },
  }
}

export function recordNumberGemCompletion(
  score: NumberGemScore,
  mode: 'adventure' | 'npc' | 'local',
  player: NumberGemLocalPlayer,
): NumberGemScore {
  if (mode === 'local' && score.localQuestions[player] >= NUMBER_GEM_LOCAL_QUESTIONS) {
    return score
  }
  const next = {
    stars: score.stars + 1,
    localStars: { ...score.localStars },
    localQuestions: { ...score.localQuestions },
  }
  if (mode === 'local') {
    next.localStars[player] += 1
    next.localQuestions[player] += 1
  }
  return next
}

export function isNumberGemLocalMatchComplete(score: NumberGemScore): boolean {
  return score.localQuestions[1] >= NUMBER_GEM_LOCAL_QUESTIONS
    && score.localQuestions[2] >= NUMBER_GEM_LOCAL_QUESTIONS
}
