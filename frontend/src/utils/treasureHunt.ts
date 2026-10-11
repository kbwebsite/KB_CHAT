/** Treasure hunt: GPS-checkpoint races in chat (no backend change).
 * Challenge: `🎮TH:new\n<json>\n<flavor>` where json = {title, clues} and a
 *   clue = {t: text, la: lat, lo: lon, r: radiusM}.
 * Moves (hidden markers):
 *   `🎮TH:found:<roomId>:<n>` — someone reached checkpoint n (first finder wins it)
 *   `🎮TH:done:<roomId>`       — hunt closed
 * Rules: checkpoints unlock in order; finding the LAST clue wins the hunt.
 * Note: GPS can be spoofed — hunts are for fun, not prizes.
 */

export const TH_NEW_PREFIX = '🎮TH:new'
export const TH_FOUND_PREFIX = '🎮TH:found:'
export const TH_DONE_PREFIX = '🎮TH:done:'

export const TH_MIN_CLUES = 1
export const TH_MAX_CLUES = 6
export const TH_MIN_RADIUS = 20
export const TH_MAX_RADIUS = 2000
export const TH_DEFAULT_RADIUS = 100

export interface THClue {
  t: string
  la: number
  lo: number
  r: number
}

export interface THunt {
  title: string
  clues: THClue[]
}

/** True for a treasure-hunt card. */
export function isTHChallenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(TH_NEW_PREFIX)
}

/** True for any hidden hunt marker. */
export function isTHMove(text: unknown): boolean {
  return (
    typeof text === 'string' &&
    (text.startsWith(TH_FOUND_PREFIX) || text.startsWith(TH_DONE_PREFIX))
  )
}

function cleanClue(c: any): THClue | null {
  if (!c || typeof c !== 'object') return null
  const t = typeof c.t === 'string' ? c.t.trim().slice(0, 140) : ''
  const la = Number(c.la)
  const lo = Number(c.lo)
  let r = Math.round(Number(c.r))
  if (!t || !Number.isFinite(la) || !Number.isFinite(lo)) return null
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null
  if (!Number.isFinite(r)) r = TH_DEFAULT_RADIUS
  r = Math.min(TH_MAX_RADIUS, Math.max(TH_MIN_RADIUS, r))
  return { t, la, lo, r }
}

/** Hunt payload carried on the card (second line), or null when broken. */
export function parseTHunt(content: unknown): THunt | null {
  if (typeof content !== 'string' || !isTHChallenge(content)) return null
  const lines = content.split('\n')
  if (lines.length < 2) return null
  try {
    const o = JSON.parse(lines[1])
    if (!o || typeof o !== 'object') return null
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 60) : ''
    const raw = Array.isArray(o.clues) ? o.clues : []
    const clues = raw.map(cleanClue).filter((c): c is THClue => c != null).slice(0, TH_MAX_CLUES)
    if (!title || clues.length < TH_MIN_CLUES) return null
    return { title, clues }
  } catch {
    return null
  }
}

/** Great-circle distance in metres between two GPS points. */
export function haversineM(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dla = rad(la2 - la1)
  const dlo = rad(lo2 - lo1)
  const a =
    Math.sin(dla / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dlo / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

const FOUND_RE = /^🎮TH:found:(-?\d+):(\d+)/m
const DONE_RE = /^🎮TH:done:(-?\d+)/m

export interface THFind {
  senderId: number | null
  senderName: string
  id: number
}

export interface THState {
  /** clue index -> first finder */
  found: Map<number, THFind>
  done: boolean
}

/** Reduced hunt state: first finder per checkpoint, closed or not. */
export function collectTH(roomId: number, msgs: any[]): THState {
  const found = new Map<number, THFind>()
  let done = false
  const sorted = [...(msgs || [])].sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0))
  for (const m of sorted) {
    if (!m || m.is_deleted || typeof m.content !== 'string') continue
    let mt = FOUND_RE.exec(m.content)
    if (mt && Number(mt[1]) === roomId) {
      const n = Number(mt[2])
      if (!found.has(n)) {
        found.set(n, {
          senderId: m.sender_id ?? null,
          senderName: m.sender_display_name || m.sender_username || 'Someone',
          id: m.id ?? 0,
        })
      }
      continue
    }
    mt = DONE_RE.exec(m.content)
    if (mt && Number(mt[1]) === roomId) done = true
  }
  return { found, done }
}

/** Lowest unreached checkpoint, or -1 when the treasure is found. */
export function thNext(found: Map<number, THFind>, total: number): number {
  for (let i = 0; i < total; i++) if (!found.has(i)) return i
  return -1
}
