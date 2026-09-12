import type { CSSProperties } from 'react'

export interface WallpaperDef {
  id: string
  label: string
  css: CSSProperties
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
]

export const CUSTOM_WALLPAPER_KEY = 'kb_wallpaper_custom'

export function customWallpaperUrl(): string | null {
  try {
    return localStorage.getItem(CUSTOM_WALLPAPER_KEY)
  } catch {
    return null
  }
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
