# Auto-Magic Themes (2026-10-09 UTC)

## 1. Scope (OBSERVED)

The theme system was already rich (19 wallpapers incl. 3 live, 12 packs,
per-chat overrides, slideshow, custom uploads), so static presets would
add nothing. This change adds *behaviour*: time-of-day automation,
festival motion, and one-tap shuffle.

## 2. What was added

- 3 festival wallpapers (`monsoon`, `diwali`, `neon-party`), each with
  dedicated keyframes whose background-position layer counts exactly
  match the wallpaper's layer counts (`kb-fx-rain`, `kb-fx-diwali`,
  `kb-fx-neon` in `index.css`; all disabled under
  `prefers-reduced-motion`).
- 3 one-tap packs (`diwali-glow`, `monsoon-night`, `neon-carnival`);
  they render automatically in the existing pack grid (no UI change
  needed — the grid maps `THEME_PACKS`).
- Auto mode (`kb_theme_auto`, local-only like slideshow): period packs by
  local hour — 05–09 Mint Fresh, 09–17 Porcelain Glow, 17–20 Golden Reel,
  else Midnight Cinema. Applied on boot + every 15 min via `App.tsx`;
  at most 4 server writes/day through the normal `settings.update` path.
- Manual theme/accent/wallpaper edits switch Auto back off (single hook
  in `settings.update`, auto writes bypass via guard flag). Enabling
  Auto stands Slideshow down and vice versa — they never fight.
- **Appearance → Magic** section: Auto toggle + Surprise shuffle button
  (random non-current pack + success toast naming the pack).

## 3. Verification (OBSERVED)

- `themeMagic.test.ts`: 15 passed (hour boundaries, pack integrity
  against wallpaper ids, auto-flag roundtrip, shuffle exclusion).
- Full vitest: 159 passed. `tsc` clean for all touched files (the only
  `tsc` errors in the tree are in `ChannelsPanel.tsx`, uncommitted
  parallel work, untouched). `git diff --check` clean.
- Not covered: no e2e (appearance needs an authenticated session +
  settings navigation; unit + integrity tests pin the contract instead).
