import { create } from 'zustand'

export interface ThemePreset {
  id: string
  name: string
  icon: string
  description: string
  colors: {
    bgPrimary: string
    bgSecondary: string
    bgTertiary: string
    bgSurface: string
    bgElevated: string
    accent: string
    accentPrimary: string
    accentSecondary: string
    accentTertiary: string
    glassA: string
    glassB: string
    accentGlow: string
    cyanGlow: string
    pinkGlow: string
    shadowGlow: string
    shadowGlowLg: string
    gradientStart: string
    gradientMid: string
    gradientEnd: string
    bubbleSent: string
    bubbleReceived: string
    bubbleSentText: string
    bubbleReceivedText: string
    headerBg: string
    composerBg: string
    navBg: string
  }
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight-purple',
    name: 'Midnight Purple',
    icon: '💜',
    description: 'Deep purple gradients with neon glow',
    colors: {
      bgPrimary: '#06060e',
      bgSecondary: '#0c0c18',
      bgTertiary: '#14142a',
      bgSurface: '#24244a',
      bgElevated: '#1c1c38',
      accent: '270 65% 58%',
      accentPrimary: '#7c5cfc',
      accentSecondary: '#a855f7',
      accentTertiary: '#c084fc',
      glassA: 'rgba(20, 20, 42, 0.6)',
      glassB: 'rgba(124, 92, 252, 0.08)',
      accentGlow: 'rgba(124, 92, 252, 0.4)',
      cyanGlow: 'rgba(34, 211, 238, 0.35)',
      pinkGlow: 'rgba(244, 114, 182, 0.3)',
      shadowGlow: '0 0 24px rgba(124, 92, 252, 0.4)',
      shadowGlowLg: '0 0 40px rgba(124, 92, 252, 0.4), 0 0 80px rgba(124, 92, 252, 0.15)',
      gradientStart: '#7c5cfc',
      gradientMid: '#a855f7',
      gradientEnd: '#c084fc',
      bubbleSent: 'linear-gradient(135deg, #7c5cfc, #a855f7)',
      bubbleReceived: 'rgba(20, 20, 42, 0.8)',
      bubbleSentText: '#ffffff',
      bubbleReceivedText: '#f0f0ff',
      headerBg: 'rgba(6, 6, 14, 0.92)',
      composerBg: 'rgba(6, 6, 14, 0.97)',
      navBg: 'rgba(6, 6, 14, 0.97)',
    },
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    icon: '🌊',
    description: 'Cool ocean tones with wave effects',
    colors: {
      bgPrimary: '#040d1a',
      bgSecondary: '#081829',
      bgTertiary: '#0c2438',
      bgSurface: '#122d4a',
      bgElevated: '#0e2540',
      accent: '200 80% 55%',
      accentPrimary: '#0ea5e9',
      accentSecondary: '#06b6d4',
      accentTertiary: '#22d3ee',
      glassA: 'rgba(8, 24, 41, 0.7)',
      glassB: 'rgba(14, 165, 233, 0.08)',
      accentGlow: 'rgba(14, 165, 233, 0.4)',
      cyanGlow: 'rgba(34, 211, 238, 0.4)',
      pinkGlow: 'rgba(56, 189, 248, 0.3)',
      shadowGlow: '0 0 24px rgba(14, 165, 233, 0.4)',
      shadowGlowLg: '0 0 40px rgba(14, 165, 233, 0.4), 0 0 80px rgba(14, 165, 233, 0.15)',
      gradientStart: '#0ea5e9',
      gradientMid: '#06b6d4',
      gradientEnd: '#22d3ee',
      bubbleSent: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
      bubbleReceived: 'rgba(12, 36, 56, 0.8)',
      bubbleSentText: '#ffffff',
      bubbleReceivedText: '#e0f2fe',
      headerBg: 'rgba(4, 13, 26, 0.92)',
      composerBg: 'rgba(4, 13, 26, 0.97)',
      navBg: 'rgba(4, 13, 26, 0.97)',
    },
  },
  {
    id: 'emerald-forest',
    name: 'Emerald Forest',
    icon: '🌿',
    description: 'Rich greens with natural depth',
    colors: {
      bgPrimary: '#040f0a',
      bgSecondary: '#081a12',
      bgTertiary: '#0c261c',
      bgSurface: '#123328',
      bgElevated: '#0e2a20',
      accent: '160 65% 45%',
      accentPrimary: '#10b981',
      accentSecondary: '#059669',
      accentTertiary: '#34d399',
      glassA: 'rgba(8, 26, 18, 0.7)',
      glassB: 'rgba(16, 185, 129, 0.08)',
      accentGlow: 'rgba(16, 185, 129, 0.4)',
      cyanGlow: 'rgba(52, 211, 153, 0.35)',
      pinkGlow: 'rgba(16, 185, 129, 0.3)',
      shadowGlow: '0 0 24px rgba(16, 185, 129, 0.4)',
      shadowGlowLg: '0 0 40px rgba(16, 185, 129, 0.4), 0 0 80px rgba(16, 185, 129, 0.15)',
      gradientStart: '#10b981',
      gradientMid: '#059669',
      gradientEnd: '#34d399',
      bubbleSent: 'linear-gradient(135deg, #10b981, #059669)',
      bubbleReceived: 'rgba(12, 38, 28, 0.8)',
      bubbleSentText: '#ffffff',
      bubbleReceivedText: '#d1fae5',
      headerBg: 'rgba(4, 15, 10, 0.92)',
      composerBg: 'rgba(4, 15, 10, 0.97)',
      navBg: 'rgba(4, 15, 10, 0.97)',
    },
  },
  {
    id: 'sunset-fire',
    name: 'Sunset Fire',
    icon: '🔥',
    description: 'Warm orange and red gradients',
    colors: {
      bgPrimary: '#120806',
      bgSecondary: '#1c0e0a',
      bgTertiary: '#261610',
      bgSurface: '#331e16',
      bgElevated: '#2a1812',
      accent: '15 80% 55%',
      accentPrimary: '#f97316',
      accentSecondary: '#ea580c',
      accentTertiary: '#fb923c',
      glassA: 'rgba(28, 14, 10, 0.7)',
      glassB: 'rgba(249, 115, 22, 0.08)',
      accentGlow: 'rgba(249, 115, 22, 0.4)',
      cyanGlow: 'rgba(251, 146, 60, 0.35)',
      pinkGlow: 'rgba(239, 68, 68, 0.3)',
      shadowGlow: '0 0 24px rgba(249, 115, 22, 0.4)',
      shadowGlowLg: '0 0 40px rgba(249, 115, 22, 0.4), 0 0 80px rgba(249, 115, 22, 0.15)',
      gradientStart: '#f97316',
      gradientMid: '#ea580c',
      gradientEnd: '#fb923c',
      bubbleSent: 'linear-gradient(135deg, #f97316, #ea580c)',
      bubbleReceived: 'rgba(38, 22, 16, 0.8)',
      bubbleSentText: '#ffffff',
      bubbleReceivedText: '#ffedd5',
      headerBg: 'rgba(18, 8, 6, 0.92)',
      composerBg: 'rgba(18, 8, 6, 0.97)',
      navBg: 'rgba(18, 8, 6, 0.97)',
    },
  },
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    icon: '🌸',
    description: 'Elegant pink and gold tones',
    colors: {
      bgPrimary: '#100810',
      bgSecondary: '#1a0e1a',
      bgTertiary: '#241624',
      bgSurface: '#302030',
      bgElevated: '#281a28',
      accent: '330 65% 58%',
      accentPrimary: '#ec4899',
      accentSecondary: '#db2777',
      accentTertiary: '#f472b6',
      glassA: 'rgba(26, 14, 26, 0.7)',
      glassB: 'rgba(236, 72, 153, 0.08)',
      accentGlow: 'rgba(236, 72, 153, 0.4)',
      cyanGlow: 'rgba(244, 114, 182, 0.35)',
      pinkGlow: 'rgba(236, 72, 153, 0.4)',
      shadowGlow: '0 0 24px rgba(236, 72, 153, 0.4)',
      shadowGlowLg: '0 0 40px rgba(236, 72, 153, 0.4), 0 0 80px rgba(236, 72, 153, 0.15)',
      gradientStart: '#ec4899',
      gradientMid: '#db2777',
      gradientEnd: '#f472b6',
      bubbleSent: 'linear-gradient(135deg, #ec4899, #db2777)',
      bubbleReceived: 'rgba(36, 22, 36, 0.8)',
      bubbleSentText: '#ffffff',
      bubbleReceivedText: '#fce7f3',
      headerBg: 'rgba(16, 8, 16, 0.92)',
      composerBg: 'rgba(16, 8, 16, 0.97)',
      navBg: 'rgba(16, 8, 16, 0.97)',
    },
  },
  {
    id: 'arctic-aurora',
    name: 'Arctic Aurora',
    icon: '🌌',
    description: 'Northern lights with ethereal glow',
    colors: {
      bgPrimary: '#060a12',
      bgSecondary: '#0a1020',
      bgTertiary: '#101a30',
      bgSurface: '#182440',
      bgElevated: '#142038',
      accent: '240 60% 60%',
      accentPrimary: '#6366f1',
      accentSecondary: '#8b5cf6',
      accentTertiary: '#a78bfa',
      glassA: 'rgba(10, 16, 32, 0.7)',
      glassB: 'rgba(99, 102, 241, 0.08)',
      accentGlow: 'rgba(99, 102, 241, 0.4)',
      cyanGlow: 'rgba(139, 92, 246, 0.35)',
      pinkGlow: 'rgba(167, 139, 250, 0.3)',
      shadowGlow: '0 0 24px rgba(99, 102, 241, 0.4)',
      shadowGlowLg: '0 0 40px rgba(99, 102, 241, 0.4), 0 0 80px rgba(99, 102, 241, 0.15)',
      gradientStart: '#6366f1',
      gradientMid: '#8b5cf6',
      gradientEnd: '#a78bfa',
      bubbleSent: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      bubbleReceived: 'rgba(16, 26, 48, 0.8)',
      bubbleSentText: '#ffffff',
      bubbleReceivedText: '#e0e7ff',
      headerBg: 'rgba(6, 10, 18, 0.92)',
      composerBg: 'rgba(6, 10, 18, 0.97)',
      navBg: 'rgba(6, 10, 18, 0.97)',
    },
  },
  {
    id: 'cherry-blossom',
    name: 'Cherry Blossom',
    icon: '🌺',
    description: 'Soft pink with petal effects',
    colors: {
      bgPrimary: '#120810',
      bgSecondary: '#1c0e18',
      bgTertiary: '#261622',
      bgSurface: '#332030',
      bgElevated: '#2a1a28',
      accent: '340 60% 60%',
      accentPrimary: '#f43f5e',
      accentSecondary: '#e11d48',
      accentTertiary: '#fb7185',
      glassA: 'rgba(28, 14, 24, 0.7)',
      glassB: 'rgba(244, 63, 94, 0.08)',
      accentGlow: 'rgba(244, 63, 94, 0.4)',
      cyanGlow: 'rgba(251, 113, 133, 0.35)',
      pinkGlow: 'rgba(244, 63, 94, 0.4)',
      shadowGlow: '0 0 24px rgba(244, 63, 94, 0.4)',
      shadowGlowLg: '0 0 40px rgba(244, 63, 94, 0.4), 0 0 80px rgba(244, 63, 94, 0.15)',
      gradientStart: '#f43f5e',
      gradientMid: '#e11d48',
      gradientEnd: '#fb7185',
      bubbleSent: 'linear-gradient(135deg, #f43f5e, #e11d48)',
      bubbleReceived: 'rgba(38, 22, 34, 0.8)',
      bubbleSentText: '#ffffff',
      bubbleReceivedText: '#ffe4e6',
      headerBg: 'rgba(18, 8, 16, 0.92)',
      composerBg: 'rgba(18, 8, 16, 0.97)',
      navBg: 'rgba(18, 8, 16, 0.97)',
    },
  },
  {
    id: 'golden-luxury',
    name: 'Golden Luxury',
    icon: '✨',
    description: 'Premium gold with dark elegance',
    colors: {
      bgPrimary: '#0e0a04',
      bgSecondary: '#18120a',
      bgTertiary: '#221c10',
      bgSurface: '#302818',
      bgElevated: '#282014',
      accent: '40 80% 50%',
      accentPrimary: '#eab308',
      accentSecondary: '#ca8a04',
      accentTertiary: '#facc15',
      glassA: 'rgba(24, 18, 10, 0.7)',
      glassB: 'rgba(234, 179, 8, 0.08)',
      accentGlow: 'rgba(234, 179, 8, 0.4)',
      cyanGlow: 'rgba(250, 204, 21, 0.35)',
      pinkGlow: 'rgba(234, 179, 8, 0.3)',
      shadowGlow: '0 0 24px rgba(234, 179, 8, 0.4)',
      shadowGlowLg: '0 0 40px rgba(234, 179, 8, 0.4), 0 0 80px rgba(234, 179, 8, 0.15)',
      gradientStart: '#eab308',
      gradientMid: '#ca8a04',
      gradientEnd: '#facc15',
      bubbleSent: 'linear-gradient(135deg, #eab308, #ca8a04)',
      bubbleReceived: 'rgba(34, 28, 16, 0.8)',
      bubbleSentText: '#1a1204',
      bubbleReceivedText: '#fef9c3',
      headerBg: 'rgba(14, 10, 4, 0.92)',
      composerBg: 'rgba(14, 10, 4, 0.97)',
      navBg: 'rgba(14, 10, 4, 0.97)',
    },
  },
]

interface ThemeState {
  currentThemeId: string
  customColors: Partial<ThemePreset['colors']> | null
  getCurrentTheme: () => ThemePreset
  setTheme: (id: string) => void
  setCustomColor: (key: keyof ThemePreset['colors'], value: string) => void
  resetCustom: () => void
  applyTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  currentThemeId: 'midnight-purple',
  customColors: null,

  getCurrentTheme: () => {
    const preset = THEME_PRESETS.find(t => t.id === get().currentThemeId) || THEME_PRESETS[0]
    if (get().customColors) {
      return { ...preset, colors: { ...preset.colors, ...get().customColors } }
    }
    return preset
  },

  setTheme: (id) => {
    set({ currentThemeId: id, customColors: null })
    setTimeout(() => get().applyTheme(), 0)
  },

  setCustomColor: (key, value) => {
    set(state => ({
      customColors: { ...(state.customColors || {}), [key]: value }
    }))
    setTimeout(() => get().applyTheme(), 0)
  },

  resetCustom: () => {
    set({ customColors: null })
    setTimeout(() => get().applyTheme(), 0)
  },

  applyTheme: () => {
    const theme = get().getCurrentTheme()
    const root = document.documentElement
    const c = theme.colors
    root.style.setProperty('--bg-primary', c.bgPrimary)
    root.style.setProperty('--bg-secondary', c.bgSecondary)
    root.style.setProperty('--bg-tertiary', c.bgTertiary)
    root.style.setProperty('--bg-surface', c.bgSurface)
    root.style.setProperty('--bg-elevated', c.bgElevated)
    root.style.setProperty('--accent', c.accent)
    root.style.setProperty('--accent-primary', c.accentPrimary)
    root.style.setProperty('--accent-secondary', c.accentSecondary)
    root.style.setProperty('--accent-tertiary', c.accentTertiary)
    root.style.setProperty('--glass-a', c.glassA)
    root.style.setProperty('--glass-b', c.glassB)
    root.style.setProperty('--accent-glow', c.accentGlow)
    root.style.setProperty('--cyan-glow', c.cyanGlow)
    root.style.setProperty('--pink-glow', c.pinkGlow)
    root.style.setProperty('--shadow-glow', c.shadowGlow)
    root.style.setProperty('--shadow-glow-lg', c.shadowGlowLg)

    // Persist
    localStorage.setItem('kryzen_theme_id', get().currentThemeId)
    if (get().customColors) {
      localStorage.setItem('kryzen_theme_custom', JSON.stringify(get().customColors))
    } else {
      localStorage.removeItem('kryzen_theme_custom')
    }
  },
}))

// Load persisted theme on init
export function initTheme() {
  const savedId = localStorage.getItem('kryzen_theme_id')
  const savedCustom = localStorage.getItem('kryzen_theme_custom')
  const store = useThemeStore.getState()
  if (savedId) store.currentThemeId = savedId
  if (savedCustom) {
    try { store.customColors = JSON.parse(savedCustom) } catch {}
  }
  store.applyTheme()
}
