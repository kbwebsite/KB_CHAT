/** Watch-together rooms: co-watch a YouTube video or direct mp4 in chat.
 * Challenge: `🎮WT:new\n<url>` (visible card).
 * Sync:      `🎮WT:move:<roomId>:<play|pause|seek>:<posSec>` (hidden marker,
 *             host-only broadcast — same pipe as the other game moves, so no
 *             backend or protocol change is needed).
 */

export const WT_NEW_PREFIX = '🎮WT:new'
export const WT_MOVE_PREFIX = '🎮WT:move:'

export type WTAction = 'play' | 'pause' | 'seek'

export interface WTState {
  roomId: number
  action: WTAction
  /** Playback position in whole seconds. */
  pos: number
  /** Sender message id (ordering tiebreak). */
  id: number
}

/** True for a watch-together room card. */
export function isWTChallenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(WT_NEW_PREFIX)
}

/** True for a hidden watch sync marker. */
export function isWTMove(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(WT_MOVE_PREFIX)
}

/** The shared URL carried by a room card (first token after the prefix), or null. */
export function parseWTUrl(content: unknown): string | null {
  if (typeof content !== 'string' || !isWTChallenge(content)) return null
  const url = content.slice(WT_NEW_PREFIX.length).trim().split(/\s+/)[0] || ''
  return /^https?:\/\/\S+/i.test(url) ? url : null
}

const YT_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{6,})/i,
]

/** YouTube video id from a watch/embed/shorts/share URL, or null. */
export function parseYouTubeId(url: string): string | null {
  if (typeof url !== 'string') return null
  for (const re of YT_PATTERNS) {
    const m = re.exec(url)
    if (m) return m[1]
  }
  return null
}

/** True for a direct playable file (mp4/webm/mov/m3u8). */
export function isDirectMediaUrl(url: string): boolean {
  if (typeof url !== 'string') return false
  const clean = url.split(/[?#]/)[0].toLowerCase()
  return (
    /^https?:\/\/\S+/i.test(url) &&
    (clean.endsWith('.mp4') ||
      clean.endsWith('.webm') ||
      clean.endsWith('.mov') ||
      clean.endsWith('.m3u8'))
  )
}

const WT_STATE_RE = /^🎮WT:move:(-?\d+):(play|pause|seek):(\d+)/m

/** Parse one hidden sync marker, or null. */
export function parseWTState(text: unknown, id = 0): WTState | null {
  if (typeof text !== 'string') return null
  const m = WT_STATE_RE.exec(text)
  if (!m) return null
  return {
    roomId: Number(m[1]),
    action: m[2] as WTAction,
    pos: Math.max(0, Number(m[3])),
    id,
  }
}

/** Latest sync state for a room (highest message id wins). */
export function collectWTState(roomId: number, msgs: any[]): WTState | null {
  let best: WTState | null = null
  for (const m of msgs || []) {
    if (!m || m.is_deleted) continue
    const s = parseWTState(m.content, m.id)
    if (!s || s.roomId !== roomId) continue
    if (!best || (m.id ?? 0) >= (best.id ?? 0)) best = s
  }
  return best
}

/** Seconds of drift worth correcting (avoids seek fights + echo loops). */
export const WT_DRIFT_TOLERANCE = 2.5

/** True when the player should jump to the synced position. */
export function needsSeek(currentPos: number, targetPos: number): boolean {
  if (!Number.isFinite(currentPos) || !Number.isFinite(targetPos)) return false
  return Math.abs(currentPos - targetPos) > WT_DRIFT_TOLERANCE
}
