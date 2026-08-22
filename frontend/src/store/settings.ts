import { create } from 'zustand'
import { settingsApi } from '../services/api'

export interface UserSettings {
  theme: 'light' | 'dark' | 'system'
  accent_color: string
  chat_wallpaper: string
  message_notifications: boolean
  sound_enabled: boolean
  desktop_notifications: boolean
  online_status_visible: string
  read_receipts: boolean
  last_seen_visible: string
  enter_to_send: boolean
  media_auto_download: boolean
}

const defaults: UserSettings = {
  theme: 'system',
  accent_color: 'violet',
  chat_wallpaper: 'default',
  message_notifications: true,
  sound_enabled: true,
  desktop_notifications: false,
  online_status_visible: 'everyone',
  read_receipts: true,
  last_seen_visible: 'everyone',
  enter_to_send: true,
  media_auto_download: true,
}

interface SettingsState extends UserSettings {
  loading: boolean
  init: () => Promise<void>
  update: (patch: Partial<UserSettings>) => Promise<void>
  setLocal: (patch: Partial<UserSettings>) => void
}

function applyTheme(theme: string) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
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
  const hsl = hues[color] || hues.violet
  document.documentElement.style.setProperty('--primary', hsl)
  localStorage.setItem('kb_accent', color)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  loading: false,
  init: async () => {
    try {
      // local fallback first
      const localAccent = localStorage.getItem('kb_accent')
      if (localAccent) {
        set({ accent_color: localAccent })
        applyAccent(localAccent)
      }
      const localTheme = localStorage.getItem('kb_theme') as any
      if (localTheme) {
        set({ theme: localTheme })
        applyTheme(localTheme)
      }
      const token = localStorage.getItem('kb_token')
      if (!token) return
      const res = await settingsApi.get()
      if (res.success) {
        const data = res.data as UserSettings
        set({ ...data })
        applyTheme(data.theme)
        applyAccent(data.accent_color)
        localStorage.setItem('kb_theme', data.theme)
      }
    } catch {}
  },
  update: async (patch) => {
    set({ ...patch } as any)
    if (patch.theme) {
      applyTheme(patch.theme)
      localStorage.setItem('kb_theme', patch.theme)
    }
    if (patch.accent_color) applyAccent(patch.accent_color)
    if (patch.chat_wallpaper) localStorage.setItem('kb_wallpaper', patch.chat_wallpaper)
    try {
      await settingsApi.update(patch)
    } catch {}
    // also persist locally for offline
    Object.entries(patch).forEach(([k, v]) => localStorage.setItem(`kb_setting_${k}`, JSON.stringify(v)))
  },
  setLocal: (patch) => set({ ...patch } as any),
}))
