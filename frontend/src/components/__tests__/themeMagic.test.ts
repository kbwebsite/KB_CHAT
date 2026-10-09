// Auto-magic themes: period mapping, pack integrity, auto flag, shuffle.
import { describe, expect, it } from 'vitest'

import {
  THEME_PACKS,
  WALLPAPERS,
  autoPackForHour,
  isThemeAutoOn,
  setThemeAutoOn,
  surprisePack,
} from '../../utils/wallpapers'

describe('autoPackForHour', () => {
  const cases: Array<[number, string]> = [
    [0, 'midnight-cinema'],
    [4, 'midnight-cinema'],
    [5, 'mint-fresh'],
    [8, 'mint-fresh'],
    [9, 'porcelain-glow'],
    [12, 'porcelain-glow'],
    [16, 'porcelain-glow'],
    [17, 'golden-reel'],
    [19, 'golden-reel'],
    [20, 'midnight-cinema'],
    [23, 'midnight-cinema'],
  ]
  for (const [hour, id] of cases) {
    it(`hour ${hour} -> ${id}`, () => {
      expect(autoPackForHour(hour).id).toBe(id)
    })
  }
})

describe('theme pack integrity', () => {
  it('every pack points at a real wallpaper, theme and accent', () => {
    const wallpaperIds = new Set(WALLPAPERS.map((w) => w.id))
    expect(wallpaperIds.size).toBeGreaterThan(0)
    for (const p of THEME_PACKS) {
      expect(wallpaperIds.has(p.wallpaper), `pack ${p.id} wallpaper`).toBe(true)
      expect(['dark', 'light', 'system']).toContain(p.theme)
      expect(p.accent.length).toBeGreaterThan(0)
    }
  })

  it('festival wallpapers carry motion classes with reduced-motion cover', () => {
    for (const id of ['monsoon', 'diwali', 'neon-party']) {
      const w = WALLPAPERS.find((x) => x.id === id)
      expect(w, `${id} exists`).toBeDefined()
      expect(w?.className, id).toMatch(/kb-/)
    }
  })
})

describe('auto flag', () => {
  it('round-trips off by default', () => {
    setThemeAutoOn(false)
    expect(isThemeAutoOn()).toBe(false)
    setThemeAutoOn(true)
    expect(isThemeAutoOn()).toBe(true)
    setThemeAutoOn(false)
    expect(isThemeAutoOn()).toBe(false)
  })
})

describe('surprisePack', () => {
  it('never returns the current triple', () => {
    const first = THEME_PACKS[0]
    const current = {
      theme: first.theme,
      accent_color: first.accent,
      chat_wallpaper: first.wallpaper,
    }
    for (let i = 0; i < 50; i++) {
      const pick = surprisePack(current)
      const same =
        pick.theme === current.theme &&
        pick.accent === current.accent_color &&
        pick.wallpaper === current.chat_wallpaper
      expect(same).toBe(false)
    }
  })
})
