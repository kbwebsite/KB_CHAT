/**
 * Word-chain party game, played through chat messages.
 * Challenge: `🎮WC:new\n<human text>`
 * Word:      `🎮WC:word:<challengeId>:<word>`
 * Referee rules (derived identically on both sides):
 * - letters only (a-z, min 3), case-insensitive
 * - must start with the last letter of the previous VALID word
 * - no repeats (case-insensitive)
 * Invalid attempts stay visible in chat but count as strikes with a
 * reason; only valid words advance the chain and score.
 */

const CHALLENGE_PREFIX = '🎮WC:new'
const WORD_RE = /^🎮WC:word:(-?\d+):([A-Za-z]{1,30})$/m

export function isWordChainChallenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(CHALLENGE_PREFIX)
}

export function parseWordChainWord(text: string, challengeId: number): string | null {
  const m = WORD_RE.exec(text || '')
  if (!m || Number(m[1]) !== challengeId) return null
  return m[2].toLowerCase()
}

export interface ChainWord {
  word: string
  senderId: number | null
  senderName: string
}

export interface ChainStrike {
  word: string
  senderName: string
  reason: string
}

export interface ChainState {
  valid: ChainWord[]
  strikes: ChainStrike[]
  scores: Array<{ name: string; count: number }>
  needLetter: string | null
}

function cleanWord(raw: string): string | null {
  const w = raw.trim().toLowerCase()
  if (!/^[a-z]{3,30}$/.test(w)) return null
  return w
}

/** Replay history into chain state (id order, challenge-scoped). */
export function collectWordChain(challengeId: number, msgs: any[]): ChainState {
  const valid: ChainWord[] = []
  const strikes: ChainStrike[] = []
  const used = new Set<string>()
  const sorted = [...msgs].sort((a, b) => a.id - b.id)
  for (const m of sorted) {
    if (m.is_deleted) continue
    const raw = WORD_RE.exec(m.content || '')
    if (!raw || Number(raw[1]) !== challengeId) continue
    const senderName = m.sender_display_name || m.sender_username || 'Someone'
    const w = cleanWord(raw[2])
    if (!w) {
      strikes.push({ word: raw[2], senderName, reason: 'use letters only (3+)' })
      continue
    }
    if (used.has(w)) {
      strikes.push({ word: w, senderName, reason: 'already used' })
      continue
    }
    const need = valid.length > 0 ? valid[valid.length - 1].word.slice(-1) : null
    if (need && !w.startsWith(need)) {
      strikes.push({ word: w, senderName, reason: `must start with “${need}”` })
      continue
    }
    used.add(w)
    valid.push({ word: w, senderId: m.sender_id ?? null, senderName })
  }
  const scores = new Map<string, number>()
  for (const v of valid) scores.set(v.senderName, (scores.get(v.senderName) ?? 0) + 1)
  return {
    valid,
    strikes,
    scores: [...scores.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    needLetter: valid.length > 0 ? valid[valid.length - 1].word.slice(-1) : null,
  }
}
