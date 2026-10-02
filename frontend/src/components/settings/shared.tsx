import { useRef, useState } from 'react'
import { Moon, Sun, Monitor, Wallpaper, Upload, Trash2, Lock, Unlock } from 'lucide-react'
import { useSettingsStore, type UserSettings } from '../../store/settings'
import { useLockStore, PIN_RE } from '../../store/lock'
import {
  WALLPAPERS,
  THEME_PACKS,
  CUSTOM_WALLPAPER_KEY,
  customWallpaperUrl,
  imageFileToWallpaper,
  isSlideshowOn,
  setSlideshowOn,
} from '../../utils/wallpapers'

/**
 * Shared settings sections — the SINGLE UI source of truth.
 * Both SettingsPanel (desktop sidebar) and SettingsPage (mobile/full page)
 * compose these; nothing here is duplicated anywhere else. Every control
 * calls settings.update(), whose side-effects (theme/accent/push/local
 * cache/server sync) live in the store.
 */

export function ToggleRow({
  k,
  label,
  desc,
}: {
  k: keyof UserSettings
  label: string
  desc: string
}) {
  const value = useSettingsStore((s) => s[k] as boolean)
  const update = useSettingsStore((s) => s.update)
  return (
    <label className="settings-section flex items-center justify-between cursor-pointer">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => update({ [k]: e.target.checked } as any)}
        className="settings-toggle"
      />
    </label>
  )
}

export function SelectRow({
  k,
  label,
  desc,
  options,
}: {
  k: keyof UserSettings
  label: string
  desc?: string
  options: { id: string; label: string }[]
}) {
  const value = useSettingsStore((s) => s[k] as string)
  const update = useSettingsStore((s) => s.update)
  return (
    <div className="settings-section">
      <label className="text-sm font-medium">{label}</label>
      {desc && <p className="text-xs text-muted-foreground mb-1.5">{desc}</p>}
      <select
        value={value}
        onChange={(e) => update({ [k]: e.target.value } as any)}
        className="mt-1 w-full px-3 py-2 rounded-lg border-[var(--k-border)] bg-background text-sm outline-none focus:ring-2 focus:ring-ring"
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
] as const

export const ACCENTS = [
  { id: 'violet', color: 'bg-violet-600' },
  { id: 'blue', color: 'bg-blue-600' },
  { id: 'emerald', color: 'bg-emerald-600' },
  { id: 'rose', color: 'bg-rose-600' },
  { id: 'amber', color: 'bg-amber-500' },
  { id: 'indigo', color: 'bg-indigo-600' },
  { id: 'crimson', color: 'bg-red-700' },
  { id: 'cyan', color: 'bg-cyan-400' },
  { id: 'fuchsia', color: 'bg-fuchsia-500' },
  { id: 'gold', color: 'bg-yellow-400' },
] as const

const VISIBILITY_OPTS = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'contacts', label: 'Contacts only' },
  { id: 'nobody', label: 'Nobody' },
]

export function ThemePicker() {
  const theme = useSettingsStore((s) => s.theme)
  const update = useSettingsStore((s) => s.update)
  return (
    <div className="grid grid-cols-3 gap-2">
      {THEMES.map((opt) => (
        <button
          key={opt.id}
          onClick={() => update({ theme: opt.id as any })}
          className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
            theme === opt.id
              ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
              : 'bg-muted hover:bg-accent border-transparent hover:border-[var(--k-border)]'
          }`}
        >
          <opt.icon className="w-5 h-5" />
          <span className="text-xs font-medium">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

export function AccentPicker() {
  const accent = useSettingsStore((s) => s.accent_color)
  const update = useSettingsStore((s) => s.update)
  return (
    <div className="flex flex-wrap gap-2">
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          onClick={() => update({ accent_color: a.id })}
          className={`settings-accent-dot ${a.color} ${accent === a.id ? 'active' : ''}`}
          title={a.id}
        />
      ))}
    </div>
  )
}

export function WallpaperPicker() {
  const wallpaper = useSettingsStore((s) => s.chat_wallpaper)
  const update = useSettingsStore((s) => s.update)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [, bump] = useState(0)
  const [slideshow, setSlideshow] = useState(isSlideshowOn)
  const customUrl = customWallpaperUrl()
  const hasCustom = customUrl !== null

  const handleFile = async (f: File | undefined) => {
    if (!f) return
    setMsg(null)
    try {
      const dataUrl = await imageFileToWallpaper(f)
      localStorage.setItem(CUSTOM_WALLPAPER_KEY, dataUrl)
      update({ chat_wallpaper: 'custom' })
      bump((n) => n + 1)
    } catch (e: any) {
      setMsg(e?.message || 'Could not use image')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const removeCustom = () => {
    try {
      localStorage.removeItem(CUSTOM_WALLPAPER_KEY)
    } catch {}
    if (wallpaper === 'custom') update({ chat_wallpaper: 'default' })
    bump((n) => n + 1)
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {WALLPAPERS.map((w) => (
          <button
            key={w.id}
            onClick={() => update({ chat_wallpaper: w.id })}
            className={`settings-wallpaper-btn h-16 p-2 ${w.className ?? ''} ${wallpaper === w.id ? 'active' : ''}`}
            style={w.css}
          >
            <span className="text-xs bg-card/80 px-1.5 py-0.5 rounded">{w.label}</span>
          </button>
        ))}
        <button
          onClick={() => fileRef.current?.click()}
          className={`settings-wallpaper-btn h-16 p-2 overflow-hidden ${wallpaper === 'custom' ? 'active' : ''}`}
          style={
            hasCustom && customUrl
              ? { backgroundImage: `url(${customUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
          title="Upload a custom wallpaper"
        >
          <span className="text-xs bg-card/80 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Upload className="w-3 h-3" /> Custom
          </span>
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="flex items-center gap-2 mt-1.5">
        {hasCustom && (
          <button
            onClick={removeCustom}
            className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Remove custom
          </button>
        )}
        {msg && <span className="text-[11px] text-destructive">{msg}</span>}
      </div>
      <label className="flex items-center justify-between gap-2 mt-2 cursor-pointer">
        <span className="text-xs font-medium">
          Slideshow <span className="text-muted-foreground font-normal">· rotate every 45s</span>
        </span>
        <input
          type="checkbox"
          checked={slideshow}
          onChange={(e) => {
            setSlideshowOn(e.target.checked)
            setSlideshow(e.target.checked)
          }}
          className="settings-toggle"
          aria-label="Wallpaper slideshow"
        />
      </label>
    </div>
  )
}

export function NotificationPermissionRow() {
  const [, bump] = useState(0)
  const permission =
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  return (
    <button
      onClick={() => {
        if ('Notification' in window) {
          if (Notification.permission === 'default') {
            Notification.requestPermission().then(() => bump((n) => n + 1))
          } else {
            alert(`Permission: ${Notification.permission}`)
          }
        }
      }}
      className="settings-section w-full text-left hover:border-[var(--k-primary)]/20 transition-colors"
    >
      <p className="text-sm font-medium">Request notification permission</p>
      <p className="text-xs text-muted-foreground">Current: {permission}</p>
    </button>
  )
}

export function ThemePackPicker() {
  const theme = useSettingsStore((s) => s.theme)
  const accent = useSettingsStore((s) => s.accent_color)
  const wallpaper = useSettingsStore((s) => s.chat_wallpaper)
  const update = useSettingsStore((s) => s.update)
  return (
    <div className="grid grid-cols-2 gap-2">
      {THEME_PACKS.map((p) => {
        const active = theme === p.theme && accent === p.accent && wallpaper === p.wallpaper
        return (
          <button
            key={p.id}
            onClick={() => update({ theme: p.theme, accent_color: p.accent, chat_wallpaper: p.wallpaper })}
            className={`relative h-20 overflow-hidden rounded-xl border text-left transition-all active:scale-[0.98] ${
              active
                ? 'border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/20'
                : 'border-transparent hover:border-[var(--k-border)]'
            }`}
            style={p.preview}
            title={p.desc}
          >
            <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[11px] font-semibold text-white bg-black/45">
              {p.label}
            </span>
            {active && (
              <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">
                On
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function AppearanceSettings() {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium mb-2">Theme packs</p>
        <p className="text-xs text-muted-foreground mb-2">One tap sets mode, accent and wallpaper together</p>
        <ThemePackPicker />
      </div>
      <ThemePicker />
      <div>
        <p className="text-xs font-medium mb-2">Accent color</p>
        <AccentPicker />
      </div>
      <div>
        <p className="text-xs font-medium mb-2 flex items-center gap-1">
          <Wallpaper className="w-3 h-3" /> Wallpaper
        </p>
        <WallpaperPicker />
      </div>
      <SelectRow
        k="chat_font_size"
        label="Chat font size"
        desc="Message text size in the conversation view"
        options={[
          { id: 'small', label: 'Small' },
          { id: 'medium', label: 'Medium' },
          { id: 'large', label: 'Large' },
        ]}
      />
      <SelectRow
        k="message_density"
        label="Message spacing"
        desc="Comfortable breathes; compact fits more on screen"
        options={[
          { id: 'comfortable', label: 'Comfortable' },
          { id: 'compact', label: 'Compact' },
        ]}
      />
      <SelectRow
        k="bubble_style"
        label="Bubble style"
        desc="Shape of message bubbles"
        options={[
          { id: 'cozy', label: 'Cozy' },
          { id: 'sharp', label: 'Sharp' },
          { id: 'cloud', label: 'Cloud' },
          { id: 'pop', label: 'Pop' },
        ]}
      />
    </div>
  )
}

export function NotificationSettings() {
  return (
    <div className="space-y-2">
      <ToggleRow k="is_muted" label="Do not disturb" desc="Silence all sounds, vibration and popups" />
      <ToggleRow k="message_notifications" label="Message notifications" desc="Master switch for new-message alerts" />
      <ToggleRow k="sound_enabled" label="Sound" desc="Play a tone on new message" />
      <SelectRow
        k="sound_tone"
        label="Notification tone"
        options={[
          { id: 'blip', label: 'Blip' },
          { id: 'chime', label: 'Chime' },
          { id: 'pop', label: 'Pop' },
          { id: 'marimba', label: 'Marimba' },
        ]}
      />
      <ToggleRow k="vibrate_enabled" label="Vibration" desc="Short buzz on new message (mobile)" />
      <ToggleRow k="desktop_notifications" label="Desktop notifications" desc="Browser popup when chat is in background" />
      <ToggleRow k="notification_previews" label="Show message previews" desc="Include sender + text in popups; off shows just “New message”" />
      <NotificationPermissionRow />
    </div>
  )
}

export function AppLockSettings() {
  const hasPin = useLockStore((s) => s.hasPin)
  const enabled = useLockStore((s) => s.enabled)
  const setupPin = useLockStore((s) => s.setupPin)
  const setEnabled = useLockStore((s) => s.setEnabled)
  const clearPin = useLockStore((s) => s.clearPin)
  const lock = useLockStore((s) => s.lock)
  const [settingUp, setSettingUp] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const save = async () => {
    if (!PIN_RE.test(pin)) {
      setMsg('PIN must be 4–6 digits')
      return
    }
    setBusy(true)
    try {
      await setupPin(pin)
      setPin('')
      setSettingUp(false)
      setMsg('App lock is on')
    } catch (e: any) {
      setMsg(e?.message || 'Could not set PIN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            {enabled ? <Lock className="w-3.5 h-3.5 text-primary" /> : <Unlock className="w-3.5 h-3.5" />}
            App lock
          </p>
          <p className="text-xs text-muted-foreground">PIN gate on boot + auto-lock when away 1 min</p>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!hasPin}
          onChange={(e) => setEnabled(e.target.checked)}
          className="settings-toggle"
          aria-label="App lock"
        />
      </div>
      {!hasPin || settingUp ? (
        <div className="space-y-2 pt-1">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={hasPin ? 'New 4–6 digit PIN' : 'Choose a 4–6 digit PIN'}
            className="auth-input w-full px-3 py-2 rounded-lg text-sm tracking-[0.3em] text-center"
          />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="auth-submit-btn flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50">
              {busy ? 'Saving…' : hasPin ? 'Change PIN' : 'Turn on app lock'}
            </button>
            {hasPin && (
              <button onClick={() => { setSettingUp(false); setPin(''); setMsg(null) }} className="px-3 py-2 rounded-lg bg-background border border-[var(--k-border)] text-sm">
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-2 pt-1">
          <button onClick={() => { setSettingUp(true); setMsg(null) }} className="flex-1 py-1.5 rounded-lg bg-background border border-[var(--k-border)] text-xs hover:bg-muted transition-colors">
            Change PIN
          </button>
          <button onClick={() => lock()} className="flex-1 py-1.5 rounded-lg bg-background border border-[var(--k-border)] text-xs hover:bg-muted transition-colors">
            Lock now
          </button>
          <button
            onClick={() => { if (confirm('Remove the app lock PIN from this device?')) { clearPin(); setMsg(null) } }}
            className="flex-1 py-1.5 rounded-lg bg-background border border-[var(--k-border)] text-xs text-destructive hover:bg-destructive/10 transition-colors"
          >
            Remove
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-center p-1.5 rounded-lg bg-background">{msg}</p>}
    </div>
  )
}

export function PrivacyQuickSettings() {
  return (
    <div className="space-y-2">
      <SelectRow k="online_status_visible" label="Online status" desc="Who can see when you're online" options={VISIBILITY_OPTS} />
      <ToggleRow k="read_receipts" label="Read receipts" desc="Send blue ticks when you read messages" />
      <SelectRow k="last_seen_visible" label="Last seen" desc="Who can see your last active time" options={VISIBILITY_OPTS} />
    </div>
  )
}

export function ChatSettings() {
  return (
    <div className="space-y-2">
      <ToggleRow k="enter_to_send" label="Enter to send" desc="Enter sends, Shift+Enter adds a new line" />
      <ToggleRow k="media_auto_download" label="Media auto-download" desc="Load images/videos inline; off shows tap-to-load" />
      <ToggleRow k="typing_indicators" label="Typing indicators" desc="Send and show “typing…” states" />
      <ToggleRow k="link_previews" label="Link previews" desc="Unfurl links into rich cards" />
    </div>
  )
}
