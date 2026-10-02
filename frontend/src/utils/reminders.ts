import { prettyPreview } from './messageEffects'

/**
 * Message reminders ("remind me about this"). Fully local: persisted in
 * localStorage, fired by a lightweight interval in App. No backend needed.
 */

export interface Reminder {
  id: string
  convId: number | null
  convTitle: string
  sender: string
  snippet: string
  fireAt: number
}

const KEY = 'kb_reminders'

function readAll(): Reminder[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(list: Reminder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
}

function makeId(): string {
  try {
    const b = [...crypto.getRandomValues(new Uint8Array(8))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
    return `r${Date.now().toString(36)}${b}`
  } catch {
    return `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`
  }
}

/** Next 9:00 AM local time (today if still upcoming, else tomorrow). */
export function nextNineAM(from = Date.now()): number {
  const d = new Date(from)
  const nine = new Date(d)
  nine.setHours(9, 0, 0, 0)
  if (nine.getTime() <= from) nine.setDate(nine.getDate() + 1)
  return nine.getTime()
}

export function formatFireAt(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `today at ${time}`
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Schedule a reminder; returns it for confirmation UI. */
export async function scheduleMessageReminder(
  input: { convId: number | null; convTitle: string; msg: any },
  when: 'hour' | 'morning',
): Promise<Reminder> {
  const fireAt = when === 'hour' ? Date.now() + 3600 * 1000 : nextNineAM()
  const body = (prettyPreview(input.msg?.content) || '').slice(0, 100) || '[attachment]'
  const r: Reminder = {
    id: makeId(),
    convId: input.convId,
    convTitle: input.convTitle || 'Chat',
    sender: input.msg?.sender_display_name || input.msg?.sender_username || 'Someone',
    snippet: body,
    fireAt,
  }
  const list = readAll()
  list.push(r)
  writeAll(list)
  // Best effort: ask for popup permission now so the reminder can pop later.
  void ensureNotificationPermission()
  return r
}

/** Remove and return all reminders due at `now` (used by the ticker). */
export function popDueReminders(now = Date.now()): Reminder[] {
  const list = readAll()
  const due = list.filter((r) => r.fireAt <= now)
  if (due.length === 0) return []
  writeAll(list.filter((r) => r.fireAt > now))
  return due.sort((a, b) => a.fireAt - b.fireAt)
}
