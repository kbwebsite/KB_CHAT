import { create } from 'zustand'

/** Per-chat nicknames: my private labels, this-device only (localStorage).
 * Follows the wallpaper/accent precedent — never synced, no backend. */

const KEY = 'kb_nicknames'

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    const m = raw ? JSON.parse(raw) : {}
    if (!m || typeof m !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 60)
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {}
}

interface NicknameState {
  version: number
  get: (convId: number | null | undefined) => string | null
  set: (convId: number, name: string | null) => void
}

export const useNicknameStore = create<NicknameState>((set, get) => ({
  version: 0,
  get: (convId) => {
    if (convId == null) return null
    return readAll()[String(convId)] ?? null
  },
  set: (convId, name) => {
    const map = readAll()
    const clean = (name || '').trim().slice(0, 60)
    if (clean) map[String(convId)] = clean
    else delete map[String(convId)]
    writeAll(map)
    set({ version: get().version + 1 })
  },
}));

/** Pure display-title rule (tested): nickname wins, then real title. */
export function displayTitle(nick: string | null | undefined, realTitle?: string | null): string {
  return nick || realTitle || 'Unknown'
}

/** Reactive display title: nickname wins, falls back to the real title. */
export function useDisplayTitle(convId: number | null | undefined, realTitle?: string | null): string {
  useNicknameStore((s) => s.version)
  if (convId == null) return realTitle || 'Unknown'
  return displayTitle(useNicknameStore.getState().get(convId), realTitle)
}
