/**
 * "Delete for me": hides messages only on this device (the server copy and
 * everyone else's view are untouched). Stored per conversation in
 * localStorage — no backend change needed.
 */

const KEY = 'kb_hidden_msgs'

function readMap(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, number[]> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) out[k] = (v as unknown[]).filter((x) => typeof x === 'number') as number[]
    }
    return out
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, number[]>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {}
}

export function hiddenIds(convId: number | null | undefined): Set<number> {
  if (convId == null) return new Set()
  return new Set(readMap()[String(convId)] || [])
}

export function hideMessage(convId: number, msgId: number): void {
  const map = readMap()
  const k = String(convId)
  const list = map[k] || []
  if (!list.includes(msgId)) {
    list.push(msgId)
    map[k] = list.slice(-500)
    writeMap(map)
  }
}
