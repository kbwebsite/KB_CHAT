/**
 * Per-chat away auto-reply (local-only, like wallpapers).
 * When on, the first incoming message per conversation per hour gets the
 * configured reply, sent through the normal send path (optimistic UI +
 * retry included). The hourly cap is the loop guard: two auto-repliers
 * exchange at most one message per hour per direction, never a storm.
 * Only fires while the app is open (no background service exists).
 */

export interface AutoReplyConfig {
  on: boolean
  text: string
  lastSent: number
}

const KEY = 'kb_autoreply'
const COOLDOWN_MS = 3600 * 1000
export const AUTO_REPLY_COOLDOWN_MS = COOLDOWN_MS
export const DEFAULT_REPLY_TEXT = 'Hey! I’m away right now — I’ll get back to you soon. 👋'

function readAll(): Record<string, AutoReplyConfig> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, AutoReplyConfig>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {}
}

export function getAutoReply(convId: number | null | undefined): AutoReplyConfig {
  if (convId == null) return { on: false, text: DEFAULT_REPLY_TEXT, lastSent: 0 }
  const c = readAll()[String(convId)]
  return {
    on: !!c?.on,
    text: typeof c?.text === 'string' && c.text.trim() ? c.text : DEFAULT_REPLY_TEXT,
    lastSent: typeof c?.lastSent === 'number' ? c.lastSent : 0,
  }
}

export function setAutoReply(convId: number, patch: Partial<Pick<AutoReplyConfig, 'on' | 'text'>>): AutoReplyConfig {
  const map = readAll()
  const cur = getAutoReply(convId)
  const next: AutoReplyConfig = {
    on: patch.on ?? cur.on,
    text: (patch.text ?? cur.text).slice(0, 500),
    lastSent: cur.lastSent,
  }
  map[String(convId)] = next
  writeAll(map)
  return next
}

/** True when a reply may go out now (enabled + cooldown elapsed). */
export function shouldAutoReply(convId: number, now = Date.now()): boolean {
  const c = getAutoReply(convId)
  return c.on && now - c.lastSent >= COOLDOWN_MS
}

export function markAutoReplied(convId: number, now = Date.now()): void {
  const map = readAll()
  const cur = getAutoReply(convId)
  map[String(convId)] = { ...cur, lastSent: now }
  writeAll(map)
}
