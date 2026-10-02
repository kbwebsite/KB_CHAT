/**
 * Chat levels (XP gamification). Fully local: XP accrues per message sent
 * (+10) and received (+2). Level n needs 50·n·(n−1) total XP.
 * Level-ups are celebrated by the caller (confetti + toast).
 */

const XP_KEY = 'kb_xp_total'
const SENT_KEY = 'kb_msgs_sent'

function readNum(key: string): number {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  } catch {
    return 0
  }
}

function writeNum(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v))
  } catch {}
}

export function totalXp(): number {
  return readNum(XP_KEY)
}

export function sentCount(): number {
  return readNum(SENT_KEY)
}

export function countSent(): void {
  writeNum(SENT_KEY, readNum(SENT_KEY) + 1)
}

export function levelFor(xp: number): { level: number; into: number; need: number } {
  let level = 1
  while (xp >= 50 * (level + 1) * level) level++
  const base = 50 * level * (level - 1)
  const next = 50 * (level + 1) * level
  return { level, into: xp - base, need: Math.max(next - base, 1) }
}

/** Add XP; reports whether a level boundary was just crossed. */
export function addXp(n: number): { leveledUp: boolean; level: number } {
  const before = levelFor(readNum(XP_KEY)).level
  const total = readNum(XP_KEY) + n
  writeNum(XP_KEY, total)
  const after = levelFor(total).level
  return { leveledUp: after > before, level: after }
}
