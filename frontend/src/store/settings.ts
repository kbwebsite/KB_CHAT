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

function applyAccent(color: string) {
  const hues: Record<string, string> = {
    violet: '221 83% 53%',
    blue: '217 91% 60%',
    emerald: '142 76% 36%',
    rose: '346 77% 49%',
    amber: '38 92% 50%',
    indigo: '263 70% 50%',
  }
  document.documentElement.style.setProperty('--primary', hues[color] || hues.violet)
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
