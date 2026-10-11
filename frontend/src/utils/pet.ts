// Group Pet stages. Thresholds mirror backend/services/groups.py PET_STAGES
// — keep both in sync.
export const PET_STAGES = [
  { minXp: 0, id: 'egg', emoji: '🥚', label: 'Egg' },
  { minXp: 10, id: 'baby', emoji: '🐣', label: 'Baby' },
  { minXp: 30, id: 'teen', emoji: '🐥', label: 'Teen' },
  { minXp: 70, id: 'adult', emoji: '🦅', label: 'Adult' },
  { minXp: 150, id: 'legend', emoji: '🐉', label: 'Legend' },
] as const

export interface PetInfo {
  name: string
  xp: number
  stage: string
  emoji: string
  next_stage_xp: number | null
}

export function stageForXp(xp: number) {
  const x = Math.max(0, xp || 0)
  let cur: (typeof PET_STAGES)[number] = PET_STAGES[0]
  for (const s of PET_STAGES) {
    if (x >= s.minXp) cur = s
  }
  const next = PET_STAGES.find((s) => s.minXp > x) ?? null
  return { ...cur, next_stage_xp: next ? next.minXp : null }
}

/** Mood from recent chatter (messages in the last 24h). Pure + local. */
export function petMood(recentCount: number): { emoji: string; label: string } {
  if (recentCount >= 20) return { emoji: '😋', label: 'playful' }
  if (recentCount >= 5) return { emoji: '😊', label: 'happy' }
  if (recentCount >= 1) return { emoji: '🙂', label: 'content' }
  return { emoji: '😴', label: 'sleepy' }
}
