# WAVE PE-2K — Playwright E2E Regression Foundation (2026-10-09 UTC)

## 1. Preflight (OBSERVED)

- Branch `main`; HEAD was `4727295`; all reported commits present and
  linear: `3bf84fd` (landing) … `090b714`, `f05e985` (PE-2I), `f62fe69`
  (parallel landing/UI), `4727295` (refresh fix). No divergence.
- `origin/main` was `f62fe69` (ahead 1, behind 0) → pushed `4727295`
  (`f62fe69..4727295`), then re-verified ahead 0.
- Unrelated work preserved throughout: no reset/clean/stash/amend. The two
  modified Android gradle files and all untracked sqlite `-shm/-wal`,
  `.mece` drafts, and upload artifacts were never staged or touched.
- No repo Playwright config or e2e specs existed (`.playwright-mcp/` holds
  only MCP browser-session logs). CI (`.github/workflows/ci.yml`) runs
  backend pytest + `tsc` + build; it is locally modified by unrelated work,
  so CI was NOT extended here (see §7).

## 2. Architecture

- `frontend/playwright.config.ts`: `smoke` (landing only) + `e2e`
  projects, single worker (temp-sqlite backend), traces OFF (they would
  embed tokens) with failure screenshots kept (synthetic data only).
- `frontend/e2e/fixtures.ts`: env URLs, unique users, API signup,
  cookie-bridging into the SPA origin, onboarding pre-seeding
  (`kb_onboarded_<id>`), per-form-factor ready assertions.
- Managed servers per run: backend uvicorn on a fresh temp SQLite file
  (`reuseExistingServer: false` — a reused dev backend would write real
  rows into `kbchat.db`); frontend `npm run dev` (reused locally).
- Env: `KB_E2E_FRONTEND_URL` (default `http://localhost:5173`),
  `KB_E2E_BACKEND_URL` (default `http://127.0.0.1:8000`),
  optional `KB_E2E_USERNAME`/`KB_E2E_PASSWORD` override (unused by default;
  fixtures self-sign-up). No credentials/tokens are logged.
- Commands: `npm run test:e2e`, `npm run test:e2e:smoke` (frontend/).
- Cleanup deletes ONLY test-created rows via supported APIs (unsave,
  delete conversation, delete broadcast list); users persist in the
  throwaway temp DB, which dies with the run.

## 3. Coverage and actual results (OBSERVED, 13/13 passed)

- Landing smoke (5): h1 + CTAs, no overflow at 390/1440px, link
  navigation to /signup + /login, no failed same-origin requests, no page
  errors.
- Auth (4): invalid login shows `role=alert` and stays on /login;
  signup reaches /chat authenticated; no-cookie refresh is **401**
  backend-direct AND through the Vite proxy (a 500 fails the test with a
  backend-health diagnostic so proxy outages are never mislabeled as auth
  defects); valid-session refresh rotates (200 + `kb_refresh` cookie).
- Mobile search (1, 390px): opens via Global search, Escape closes without
  leaving /chat, gibberish query shows "No results found", no overflow.
  Hardware Back is not emulated in desktop Chromium — unimplemented.
- Saved messages (1): API-saved message opened via the panel lands on its
  conversation with the message visible.
- Broadcast (2): UI create (`1 people`, members show only the accepted
  recipient) + UI send → `Sent`, recipient API delivered+read → manual
  Refresh → `Read`; API contract (accepted-only, unknown-only 400,
  receipts empty until acked, non-sender 403, removed-member send yields
  empty `sent_to`).
- Regressions beside: frontend vitest 133 passed, `tsc --noEmit` clean,
  `npm run build` passes, `git diff --check` clean.

## 4. Fixes found while writing (OBSERVED)

- `@example.com` fixture emails: `email-validator` rejects `@e2e.local`
  (special-use TLD) — first e2e run failed on signup with 422.
- `email-validator` TLD rule also noted for future fixture authors.
- Signup fires a Resend verification email that the test backend rejects
  (422, swallowed by the app): noisy logs, no test impact, no real mail.
- Onboarding tour covers fresh-account UI: pre-seeded per-user flag.
- Sidebar overflow menu (`More options`) lives in the mobile header
  (CSS-hidden ≥1024px): saved uses the desktop header button; broadcast UI
  runs at mobile viewport. Broadcast lists have **no desktop entry point**
  (application gap, not fixed here).

## 5. Known limitations / not implemented

- No CI job (existing `ci.yml` is under unrelated local modification;
  adding one would collide — recommended follow-up).
- Hardware-Back dismissal for search (needs native/emulator).
- Multi-user realtime assertions (delivery via live sockets, not API acks).
- Full browsers are ~120MB downloads; `npx playwright install chromium`
  required once per machine (done here: headless shell v1248).
