import type { CSSProperties } from 'react'
import type { UserSettings } from '../store/settings'

export interface WallpaperDef {
  id: string
  label: string
  css: CSSProperties
  /** Optional animation class (see kb-wall-drift in index.css). */
  className?: string
}

export interface ThemePack {
  id: string
  label: string
  desc: string
  theme: UserSettings['theme']
  accent: string
  wallpaper: string
  preview: CSSProperties
}

const PATTERN_BASE: CSSProperties = {
  backgroundColor: 'transparent',
}

/** Built-in chat wallpapers (pure CSS, zero assets, theme-agnostic). */
export const WALLPAPERS: WallpaperDef[] = [
  { id: 'default', label: 'Default', css: { ...PATTERN_BASE } },
  {
    id: 'dots',
    label: 'Dots',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(circle at 1px 1px, rgba(148,163,255,0.16) 1px, transparent 0)',
      backgroundSize: '22px 22px',
    },
  },
  {
    id: 'gradient',
    label: 'Gradient',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'linear-gradient(160deg, rgba(124,92,252,0.12), transparent 45%), radial-gradient(at 85% 90%, rgba(34,211,238,0.12), transparent 55%)',
    },
  },
  {
    id: 'waves',
    label: 'Waves',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(ellipse 70% 45% at 15% 0%, rgba(124,92,252,0.14), transparent 70%), radial-gradient(ellipse 60% 40% at 90% 100%, rgba(34,211,238,0.12), transparent 70%)',
    },
  },
  {
    id: 'grid',
    label: 'Grid',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'linear-gradient(rgba(148,163,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,255,0.08) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'linear-gradient(150deg, rgba(244,114,182,0.13), rgba(251,146,60,0.10) 55%, transparent 80%)',
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'linear-gradient(165deg, rgba(34,211,238,0.13), rgba(59,130,246,0.11) 55%, transparent 85%)',
    },
  },
  {
    id: 'mono',
    label: 'Mono',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(148,163,255,0.06) 0 2px, transparent 2px 14px)',
    },
  },
  {
    id: 'cinema',
    label: 'Cinema',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(ellipse 90% 55% at 50% 115%, rgba(249,115,22,0.16), transparent 65%), radial-gradient(ellipse 80% 50% at 50% -15%, rgba(34,211,238,0.12), transparent 65%), radial-gradient(ellipse 120% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.35) 100%)',
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'linear-gradient(115deg, transparent 20%, rgba(52,211,153,0.10) 38%, rgba(34,211,238,0.12) 50%, rgba(167,139,250,0.12) 62%, transparent 80%), radial-gradient(ellipse 60% 35% at 80% 0%, rgba(52,211,153,0.10), transparent 70%)',
    },
  },
  {
    id: 'synthwave',
    label: 'Synthwave 3D',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(circle at 50% 108%, rgba(244,114,182,0.20), transparent 42%), linear-gradient(transparent 52%, rgba(34,211,238,0.10) 78%, rgba(244,114,182,0.12)), repeating-linear-gradient(90deg, rgba(34,211,238,0.09) 0 2px, transparent 2px 44px)',
    },
  },
  {
    id: 'galaxy',
    label: 'Galaxy',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(circle at 12% 18%, rgba(255,255,255,0.20) 0 1px, transparent 2px), radial-gradient(circle at 68% 8%, rgba(255,255,255,0.16) 0 1px, transparent 2px), radial-gradient(circle at 84% 42%, rgba(255,255,255,0.18) 0 1px, transparent 2px), radial-gradient(circle at 32% 64%, rgba(255,255,255,0.14) 0 1px, transparent 2px), radial-gradient(circle at 55% 88%, rgba(255,255,255,0.16) 0 1px, transparent 2px), radial-gradient(ellipse 55% 40% at 75% 70%, rgba(168,85,247,0.14), transparent 70%), radial-gradient(ellipse 45% 35% at 20% 80%, rgba(34,211,238,0.10), transparent 70%)',
    },
  },
  {
    id: 'bokeh',
    label: 'Bokeh',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(circle 26px at 18% 24%, rgba(251,191,36,0.16), transparent 70%), radial-gradient(circle 38px at 78% 18%, rgba(251,146,60,0.13), transparent 70%), radial-gradient(circle 22px at 62% 72%, rgba(253,224,71,0.14), transparent 70%), radial-gradient(circle 30px at 28% 82%, rgba(244,114,182,0.10), transparent 70%), radial-gradient(circle 18px at 88% 58%, rgba(251,191,36,0.15), transparent 70%)',
    },
  },
  {
    id: 'noir',
    label: 'Noir',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(ellipse 100% 70% at 50% 0%, rgba(255,255,255,0.05), transparent 60%), radial-gradient(ellipse 120% 100% at 50% 50%, transparent 50%, rgba(0,0,0,0.5) 100%)',
    },
  },
  {
    id: 'royal',
    label: 'Royal',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(ellipse 55% 40% at 20% 15%, rgba(168,85,247,0.16), transparent 70%), radial-gradient(ellipse 45% 35% at 85% 80%, rgba(251,191,36,0.13), transparent 70%), radial-gradient(ellipse 70% 50% at 50% 50%, rgba(76,29,149,0.10), transparent 75%)',
    },
  },
  {
    id: 'tide',
    label: 'Tide · live',
    className: 'kb-wall-drift',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(ellipse 70% 50% at 20% 30%, rgba(34,211,238,0.14), transparent 70%), radial-gradient(ellipse 70% 50% at 80% 75%, rgba(59,130,246,0.13), transparent 70%)',
      backgroundSize: '180% 180%, 180% 180%',
    },
  },
  {
    id: 'ember',
    label: 'Ember · live',
    className: 'kb-wall-drift',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'radial-gradient(ellipse 55% 40% at 30% 85%, rgba(249,115,22,0.15), transparent 70%), radial-gradient(ellipse 45% 35% at 72% 90%, rgba(244,63,94,0.12), transparent 70%)',
      backgroundSize: '180% 180%, 180% 180%',
    },
  },
  {
    id: 'prism',
    label: 'Prism · live',
    className: 'kb-wall-drift',
    css: {
      ...PATTERN_BASE,
      backgroundImage:
        'linear-gradient(115deg, rgba(34,211,238,0.10), rgba(167,139,250,0.12) 30%, rgba(244,114,182,0.10) 55%, rgba(253,224,71,0.08) 75%, rgba(34,211,238,0.10))',
      backgroundSize: '300% 300%',
    },
  },
]

/** One-tap theme packs: mode + accent + wallpaper applied together. */
export const THEME_PACKS: ThemePack[] = [
  {
    id: 'midnight-cinema',
    label: 'Midnight Cinema',
    desc: 'Dark room, red seats, projector glow',
    theme: 'dark',
    accent: 'crimson',
    wallpaper: 'cinema',
    preview: { backgroundImage: 'linear-gradient(135deg, #0b0b14, #7f1d1d 55%, #f97316)' },
  },
  {
    id: 'neon-horizon',
    label: 'Neon Horizon 3D',
    desc: 'Synthwave grid over a neon dusk',
    theme: 'dark',
    accent: 'cyan',
    wallpaper: 'synthwave',
    preview: { backgroundImage: 'linear-gradient(135deg, #050514, #164e63 50%, #ec4899)' },
  },
  {
    id: 'aurora-veil',
    label: 'Aurora Veil',
    desc: 'Northern lights on deep night',
    theme: 'dark',
    accent: 'fuchsia',
    wallpaper: 'aurora',
    preview: { backgroundImage: 'linear-gradient(135deg, #07130f, #065f46 45%, #a855f7)' },
  },
  {
    id: 'golden-reel',
    label: 'Golden Reel',
    desc: 'Warm premiere-night gold bokeh',
    theme: 'dark',
    accent: 'gold',
    wallpaper: 'bokeh',
    preview: { backgroundImage: 'linear-gradient(135deg, #14100a, #92400e 55%, #fbbf24)' },
  },
  {
    id: 'deep-galaxy',
    label: 'Deep Galaxy',
    desc: 'Starfield drift in indigo space',
    theme: 'dark',
    accent: 'indigo',
    wallpaper: 'galaxy',
    preview: { backgroundImage: 'linear-gradient(135deg, #050510, #312e81 55%, #22d3ee)' },
  },
  {
    id: 'porcelain-glow',
    label: 'Porcelain Glow',
    desc: 'Bright and airy sunset light',
    theme: 'light',
    accent: 'rose',
    wallpaper: 'sunset',
    preview: { backgroundImage: 'linear-gradient(135deg, #fff7ed, #fda4af 55%, #fb923c)' },
  },
  {
    id: 'tidal-drift',
    label: 'Tidal Drift',
    desc: 'Slow animated ocean currents',
    theme: 'dark',
    accent: 'blue',
    wallpaper: 'tide',
    preview: { backgroundImage: 'linear-gradient(135deg, #04121f, #0e7490 55%, #3b82f6)' },
  },
  {
    id: 'ember-rise',
    label: 'Ember Rise',
    desc: 'Rising premiere-night embers',
    theme: 'dark',
    accent: 'amber',
    wallpaper: 'ember',
    preview: { backgroundImage: 'linear-gradient(135deg, #170c06, #9a3412 55%, #fbbf24)' },
  },
  {
    id: 'prism-flow',
    label: 'Prism Flow',
    desc: 'Slow-shifting pastel light',
    theme: 'dark',
    accent: 'violet',
    wallpaper: 'prism',
    preview: { backgroundImage: 'linear-gradient(135deg, #0d0716, #6d28d9 50%, #f0abfc)' },
  },
  {
    id: 'noir-premiere',
    label: 'Noir Premiere',
    desc: 'Pure cinema black',
    theme: 'dark',
    accent: 'rose',
    wallpaper: 'noir',
    preview: { backgroundImage: 'linear-gradient(135deg, #000000, #3f3f46 60%, #fb7185)' },
  },
  {
    id: 'royal-velvet',
    label: 'Royal Velvet',
    desc: 'Purple reign with gold trim',
    theme: 'dark',
    accent: 'gold',
    wallpaper: 'royal',
    preview: { backgroundImage: 'linear-gradient(135deg, #12071f, #6b21a8 50%, #fbbf24)' },
  },
  {
    id: 'mint-fresh',
    label: 'Mint Fresh',
    desc: 'Bright airy daylight',
    theme: 'light',
    accent: 'emerald',
    wallpaper: 'waves',
    preview: { backgroundImage: 'linear-gradient(135deg, #f0fdf4, #6ee7b7 55%, #34d399)' },
  },
]

/** Per-conversation wallpaper overrides: { [convId]: wallpaperId | 'default' }.
 * 'default' (or missing) means follow the global theme wallpaper. */
const CONV_WALLPAPER_KEY = 'kb_wallpaper_conv'

function readConvMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CONV_WALLPAPER_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getConvWallpaper(convId: number | null | undefined): string | null {
  if (convId == null) return null
  const v = readConvMap()[String(convId)]
  return v && v !== 'default' ? v : null
}

export function setConvWallpaper(convId: number, wallpaperId: string): void {
  try {
    const map = readConvMap()
    if (!wallpaperId || wallpaperId === 'default') delete map[String(convId)]
    else map[String(convId)] = wallpaperId
    localStorage.setItem(CONV_WALLPAPER_KEY, JSON.stringify(map))
  } catch {}
}

export const CUSTOM_WALLPAPER_KEY = 'kb_wallpaper_custom'

export function customWallpaperUrl(): string | null {
  try {
    return localStorage.getItem(CUSTOM_WALLPAPER_KEY)
  } catch {
    return null
  }
}

/** Animation class for a wallpaper id ('' when static). */
export function wallpaperClass(id: string | null | undefined): string {
  return WALLPAPERS.find((w) => w.id === id)?.className ?? ''
}

/** Resolve the message-list background for a wallpaper id. */
export function wallpaperStyle(id: string | null | undefined): CSSProperties {
  if (id === 'custom') {
    const url = customWallpaperUrl()
    if (url) {
      return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    }
    return {}
  }
  return WALLPAPERS.find(w => w.id === id)?.css ?? {}
}

/** Downscale an image for localStorage (quota-safe) and return a data URL. */
export function imageFileToWallpaper(
  file: File,
  maxDim = 1280,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Only image files work as wallpaper'))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('Image too large (max 10MB)'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.width * scale))
        c.height = Math.max(1, Math.round(img.height * scale))
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(url)
        resolve(c.toDataURL('image/jpeg', 0.82))
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e instanceof Error ? e : new Error('Could not read image'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}
