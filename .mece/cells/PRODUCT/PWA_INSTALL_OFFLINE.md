# PWA Install + Offline Shell (2026-10-09 UTC)

## 1. Starting point (OBSERVED)

No manifest, no app service worker (only `firebase-messaging-sw.js` for
push), no install affordance, no network-offline UI (only user-presence
`is_online`). Logo source `krizen-logo.png` is 512×512 RGBA — reused.

## 2. What was added

- `frontend/public/manifest.webmanifest` — name/short_name, standalone,
  portrait, `#06060e` theme/bg, 192 + 512 + maskable-512 icons.
- Icons generated from the logo with PIL: `icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png` (logo at 80% on `#06060e` for
  the maskable safe zone). `.gitignore` keeps `*.png` ignored except
  these + the logo.
- `frontend/public/app-sw.js` (hand-rolled, no new dependency):
  versioned precache of the shell (`/`, `/index.html`, manifest, icons);
  navigations network-first with cached-shell fallback; same-origin
  static assets stale-while-revalidate; `/api/*`, `/ws/*`, third-party
  and non-GET pass through untouched (never stale data, never auth).
  Old caches purged on activate. Separate registration from the Firebase
  push worker, whose lifecycle is unchanged.
- `frontend/src/utils/pwa.ts` — `registerAppSW()` (called from
  `main.tsx` in PROD builds only, so dev never serves stale modules),
  `installState()` (`installed` / `prompt` / `ios-manual` /
  `unavailable`), iOS + standalone detection. The browser install prompt
  is deferred until the in-app Install button fires it.
- `OfflineBanner` (mounted in `App.tsx`): `role=status` pill while
  `navigator.onLine` is false; hidden otherwise.
- `PwaInstallSection` + new **Settings → Install app** section: installed
  confirmation, one-tap Install (Chrome/Edge/Android/desktop), iPhone
  Share → Add-to-Home-Screen guidance, honest fallback text elsewhere.
- `index.html`: manifest link, apple-touch-icon, mobile-web-app-capable,
  black-translucent status bar.

## 3. Verification (OBSERVED)

- Vitest `pwa.test.ts`: 4 passed (banner show/hide on offline/online
  events; install section unavailable text + prompt-event button).
- `tsc --noEmit` clean; full vitest run + `npm run build` pass; all PWA
  assets present in `dist/`; `git diff --check` clean.
- E2E `e2e/pwa.spec.ts` (smoke): manifest identity, icon serving,
  landing link tags — 3 passed (smoke 8/8 with landing).
- Live prod-preview check: SW registers and activates; offline navigation
  serves the shell; a **visited** route (`/login`) boots fully offline
  with identical content. Unvisited lazy route chunks need one online
  visit first — standard PWA behavior, not a defect.
- Side confirmation: preview-server logs show the Vite proxy returning
  500 for `/api/auth/refresh` when the backend is down (ECONNREFUSED),
  matching the PE-2J environmental diagnosis.

## 4. Limits (not built)

- No message outbox changes (a send queue already exists in the chat
  store); offline sends behave exactly as before.
- No push-via-SW changes; no `injectManifest`/Workbox dependency.
- iOS install is manual by platform design; install prompt availability
  depends on the browser's engagement heuristics.
