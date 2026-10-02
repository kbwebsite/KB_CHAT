import { create } from 'zustand'
import { settingsApi } from '../services/api'

/**
 * Settings architecture (single source of truth).
 *
 * Every key below is FUNCTIONAL — each one has a documented consumer:
 *
 *  appearance
 *   theme               -> applyTheme(): <html> dark class              (server)
 *   accent_color        -> applyAccent(): --primary + kb_setting        (server)
 *   chat_wallpaper      -> ChatView wallpaperStyle()                   (server)
 *   chat_font_size      -> ChatView data-fontsize + index.css rules     (local)
 *   message_density     -> ChatView data-density + index.css rules      (local)
 *  notifications
 *   message_notifications -> master gate in chat.ts message.new handler (server)
 *   sound_enabled       -> playPing() in same handler                   (server)
 *   vibrate_enabled     -> vibrateNewMessage() in same handler          (local)
 *   desktop_notifications -> Notification popup + push register/unreg   (server)
 *   is_muted (DND)      -> kills sound+vibrate+desktop in handler       (server)
 *   notification_previews -> popup body: "Name: text" vs "New message"  (server)
 *  privacy (server; enforced backend-side in users/extended/WS receipts)
 *   online_status_visible, last_seen_visible, read_receipts
 *  chat
 *   enter_to_send       -> MessageComposer key handling                 (server)
 *   media_auto_download -> MessageBubble tap-to-load placeholders       (server)
 *   typing_indicators   -> send + display typing events                 (local)
 *   link_previews       -> LinkPreview unfurl in MessageBubble          (local)
 *
 * Scope "server" = persisted via PATCH /api/settings (needs a backend
 * column). Scope "local" = this-device only, localStorage, never sent.
 * Adding a server setting requires a backend column + API field; adding a
 * local one is just defaults + LOCAL_KEYS + a consumer.
 */

export type Theme = 'light' | 'dark' | 'system'
export type ChatFontSize = 'small' | 'medium' | 'large'
export type MessageDensity = 'comfortable' | 'compact'
export type Visibility = 'everyone' | 'contacts' | 'nobody'

export interface UserSettings {
  theme: Theme
  accent_color: string
  chat_wallpaper: string
  chat_font_size: ChatFontSize
  message_density: MessageDensity
  message_notifications: boolean
  sound_enabled: boolean
  vibrate_enabled: boolean
  desktop_notifications: boolean
  is_muted: boolean
  notification_previews: boolean
  online_status_visible: Visibility
  read_receipts: boolean
  last_seen_visible: Visibility
  enter_to_send: boolean
  media_auto_download: boolean
  typing_indicators: boolean
  link_previews: boolean
}

const defaults: UserSettings = {
  theme: 'system',
  accent_color: 'violet',
  chat_wallpaper: 'default',
  chat_font_size: 'medium',
  message_density: 'comfortable',
  message_notifications: true,
  sound_enabled: true,
  vibrate_enabled: true,
  desktop_notifications: false,
  is_muted: false,
  notification_previews: true,
  online_status_visible: 'everyone',
  read_receipts: true,
  last_seen_visible: 'everyone',
  enter_to_send: true,
  media_auto_download: true,
  typing_indicators: true,
  link_previews: true,
}

/** Keys with a backend column (sent to PATCH /api/settings). */
export const SERVER_KEYS = new Set<keyof UserSettings>([
  'theme',
  'accent_color',
  'chat_wallpaper',
  'message_notifications',
  'sound_enabled',
  'desktop_notifications',
  'is_muted',
  'notification_previews',
  'online_status_visible',
  'read_receipts',
  'last_seen_visible',
  'enter_to_send',
  'media_auto_download',
])

const localKey = (k: keyof UserSettings) => `kb_setting_${k}`

function readLocal<K extends keyof UserSettings>(k: K): UserSettings[K] | null {
  try {
    const raw = localStorage.getItem(localKey(k))
    if (raw != null) return JSON.parse(raw) as UserSettings[K]
  } catch {}
  return null
}

function writeLocal(k: keyof UserSettings, v: unknown) {
  try {
    localStorage.setItem(localKey(k), JSON.stringify(v))
  } catch {}
}

function applyTheme(theme: string) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** Relative luminance (0..1) for picking readable text on the accent. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

interface AccentHsl { h: number; s: number; l: number }

const ACCENT_HUES: Record<string, AccentHsl> = {
  violet: { h: 221, s: 83, l: 53 },
  blue: { h: 217, s: 91, l: 60 },
  emerald: { h: 142, s: 76, l: 36 },
  rose: { h: 346, s: 77, l: 49 },
  amber: { h: 38, s: 92, l: 50 },
  indigo: { h: 263, s: 70, l: 50 },
  crimson: { h: 348, s: 83, l: 47 },
  cyan: { h: 190, s: 90, l: 45 },
  fuchsia: { h: 292, s: 84, l: 60 },
  gold: { h: 45, s: 93, l: 47 },
}

/**
 * Derive the whole accent family (primary, secondary, complements, glows,
 * contrast text) from one hue id. Pure — usable for the global theme AND
 * per-conversation overrides.
 */
export function getAccentVars(color: string): Record<string, string> {
  const P = ACCENT_HUES[color] || ACCENT_HUES.violet
  const rot = (h: number, d: number) => (h + d + 360) % 360
  const S = { h: rot(P.h, 28), s: P.s, l: Math.min(P.l + 6, 74) }
  const T = { h: rot(P.h, 56), s: P.s, l: Math.min(P.l + 12, 82) }
  const C = { h: rot(P.h, 180), s: P.s, l: P.l }
  const Pi = { h: rot(P.h, 300), s: P.s, l: P.l }
  const tri = (c: AccentHsl) => `${c.h} ${c.s}% ${c.l}%`
  const hsl = (c: AccentHsl) => `hsl(${c.h} ${c.s}% ${c.l}%)`
  const hsla = (c: AccentHsl, a: number) => `hsla(${c.h}, ${c.s}%, ${c.l}%, ${a})`
  const rgb = (c: AccentHsl) => hslToRgb(c.h, c.s, c.l).join(', ')
  return {
    '--primary': tri(P),
    '--ring': tri(P),
    '--accent-primary': hsl(P),
    '--accent-secondary': hsl(S),
    '--accent-tertiary': hsl(T),
    '--accent-rgb': rgb(P),
    '--accent-secondary-rgb': rgb(S),
    '--cyan': hsl(C),
    '--cyan-rgb': rgb(C),
    '--pink': hsl(Pi),
    '--pink-rgb': rgb(Pi),
    '--accent-glow': hsla(P, 0.4),
    '--accent-subtle': hsla(P, 0.1),
    '--border-accent': hsla(P, 0.25),
    '--cyan-glow': hsla(C, 0.35),
    '--pink-glow': hsla(Pi, 0.3),
    // Readable text on top of the accent (white, or near-black for light accents like gold).
    '--accent-contrast': luminance(hslToRgb(P.h, P.s, P.l)) > 0.35 ? '#1a1204' : '#ffffff',
  }
}

/**
 * Single writer for the whole accent family: every accent-colored surface
 * (buttons, bubbles, gradients, glows, rings, cyan/pink pops) derives from
 * the chosen hue, so theme packs recolor the entire app.
 */
function applyAccent(color: string) {
  const vars = getAccentVars(color)
  const root = document.documentElement.style
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v)
}

/** Per-conversation accent overrides: { [convId]: accentId }. Absent =
 * follow the global theme accent. Local only (never synced). */
const CONV_ACCENT_KEY = 'kb_accent_conv'

export function getConvAccent(convId: number | null | undefined): string | null {
  if (convId == null) return null
  try {
    const raw = localStorage.getItem(CONV_ACCENT_KEY)
    const map = raw ? JSON.parse(raw) : {}
    const v = map && typeof map === 'object' ? map[String(convId)] : null
    return typeof v === 'string' && ACCENT_HUES[v] ? v : null
  } catch {
    return null
  }
}

export function setConvAccent(convId: number, accentId: string | null): void {
  try {
    const raw = localStorage.getItem(CONV_ACCENT_KEY)
    const map = raw ? JSON.parse(raw) : {}
    const m = map && typeof map === 'object' ? map : {}
    if (!accentId || !ACCENT_HUES[accentId]) delete m[String(convId)]
    else m[String(convId)] = accentId
    localStorage.setItem(CONV_ACCENT_KEY, JSON.stringify(m))
  } catch {}
}

/** Push lifecycle follows the desktop toggle (shared by Panel + Page). */
function applyDesktopPref(enabled: boolean) {
  import('../utils/push')
    .then((m) => {
      if (enabled) m.initWebPush({ desktop: true })
      else m.unregisterWebPush()
    })
    .catch(() => {})
}

interface SettingsState extends UserSettings {
  loading: boolean
  init: () => Promise<void>
  update: (patch: Partial<UserSettings>) => Promise<void>
  setLocal: (patch: Partial<UserSettings>) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  loading: false,

  init: async () => {
    // 1. Local cache first (instant, offline-safe) for every key.
    const cached: Partial<UserSettings> = {}
    for (const k of Object.keys(defaults) as (keyof UserSettings)[]) {
      const v = readLocal(k)
      if (v !== null) (cached as any)[k] = v
    }
    // One-time migration from pre-restructure keys.
    if (cached.accent_color == null) {
      const legacy = localStorage.getItem('kb_accent')
      if (legacy) cached.accent_color = legacy
    }
    if (cached.theme == null) {
      const legacy = localStorage.getItem('kb_theme') as Theme | null
      if (legacy) cached.theme = legacy
    }
    if (Object.keys(cached).length) set(cached as any)
    applyTheme(get().theme)
    applyAccent(get().accent_color)

    // 2. Server truth (only when logged in); server wins for server keys.
    try {
      if (!localStorage.getItem('kb_token')) return
      const res = await settingsApi.get()
      if (res.success) {
        const data = res.data as Partial<UserSettings>
        const serverPatch: Partial<UserSettings> = {}
        for (const k of SERVER_KEYS) {
          if (data[k] !== undefined && data[k] !== null) {
            ;(serverPatch as any)[k] = data[k]
            writeLocal(k, data[k])
          }
        }
        if (Object.keys(serverPatch).length) set(serverPatch as any)
        applyTheme(get().theme)
        applyAccent(get().accent_color)
      }
    } catch {}
  },

  update: async (patch) => {
    set(patch as any)
    if (patch.theme) applyTheme(patch.theme)
    if (patch.accent_color) applyAccent(patch.accent_color)
    if (patch.desktop_notifications !== undefined) {
      applyDesktopPref(patch.desktop_notifications)
    }
    for (const [k, v] of Object.entries(patch)) {
      writeLocal(k as keyof UserSettings, v)
    }
    // Server persists only keys it knows; local-only keys stay on-device.
    const serverPatch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (SERVER_KEYS.has(k as keyof UserSettings)) serverPatch[k] = v
    }
    if (Object.keys(serverPatch).length) {
      try {
        await settingsApi.update(serverPatch)
      } catch {}
    }
  },

  setLocal: (patch) => set(patch as any),
}))
