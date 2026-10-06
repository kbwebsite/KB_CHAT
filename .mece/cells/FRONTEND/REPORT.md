# FRONTEND REPORT — Channels + Communities Post-Redesign Polish Pass

Base commit: `d0b6732` (redesign) → this pass (no redesign, no backend changes).

## 1. Problems found

| # | Problem | Where |
|---|---------|-------|
| 1 | Same channel/community rendered in both Featured/Trending and All sections on small datasets — screen felt duplicated | ChannelsPanel, CommunitiesPanel |
| 2 | "1 groups / 1 members / 1 posts / 1 followers" grammar bugs throughout | Both panels |
| 3 | Plural logic copy-pasted per component (would diverge) | Both panels |
| 4 | Post footer showed follower count with an eye icon, implying per-post view counts the backend does not track | ChannelsPanel |
| 5 | Cover cards too tall for 360–390px screens (h-24/h-28 covers + loose padding) | Both panels |
| 6 | Profile headers inconsistent (py/spacing, channel profile had no Close button) | Both panels |
| 7 | Avatar cluster: wrong overlap order (last-on-top), no z-index, text beside cluster could squeeze at 360px | CommunitiesPanel |
| 8 | Failed list loads showed the "empty" illustration (misleading) with no retry | Both panels |
| 9 | Featured channel cards + community cards not keyboard-operable (div onClick only) | Both panels |
| 10 | Wizard sheets had no max-height — could overflow small viewports | Both panels |
| 11 | Jump-to-latest button positioned against a non-relative ancestor (misplacement risk) | ChannelsPanel |
| 12 | Search inputs had no visible focus state | Both panels |

## 2. Root causes

- Discovery sections were computed independently with no exclusion (1).
- Counts were inline template strings, never centralized (2, 3).
- Eye+followers copied from a pre-redesign pattern without checking what the API returns (4).
- Covers sized for desktop balance, never re-checked at 360px (5).
- The two profile headers evolved separately (6).
- Cluster used `-space-x-2` which stacks last-on-top with no z-index control (7).
- `load()` had no error branch — empty state was the only fallback (8).
- Cards added late in the redesign without a11y pass (9).

## 3. Files changed

- `frontend/src/components/ChannelsPanel.tsx` — deduped sections, compactPlural everywhere, Eye-views removed, h-20/h-24 covers, header + Close, keyboard cards, wizard max-h, jump-anchor relative, search focus, loadError + Retry
- `frontend/src/components/CommunitiesPanel.tsx` — same, plus z-index avatar cluster with truncation guards
- `frontend/src/utils/format.ts` — added shared `plural` / `compact` / `compactPlural`
- `frontend/src/index.css` — added `.no-scrollbar` for the Featured carousel
- Backend: **untouched** (verified via `git diff --stat`: zero backend files)

## 4. UX improvements

- Small datasets show each channel/community once (All sections exclude highlighted ids and hide when empty)
- Correct grammar at every count ("1 member", "2.4K followers", stat tiles keep bare values with noun labels)
- Shorter cards, tighter padding — more content visible per 360–390px viewport, all info retained
- Consistent header language (back, identity, actions, close) in violet (channels) vs emerald (communities) identities
- Honest loading (matching skeletons) vs empty (art + CTA) vs error (message + Retry) states
- Keyboard users can open every card; focus visible on search; reduced-motion still respected

## 5. Tests executed

- `npx tsc --noEmit` — **clean**
- Topic/API behavior — unchanged backend, no new endpoints; follow/unfollow/post/announce/create/delete flows call the same verified endpoints as before
- Manual mobile/desktop tap-through — **NOT performed** (no browser automation available in this environment); replaced with careful static review of layout math (widths, truncation, min-w-0 guards, safe-area composer clearance)

## 6. Build result

- `npx vite build` — **success in ~26s** (only the pre-existing chunk-size warning)

## 7. Lint result

- `npm run lint` — **cannot run**: ESLint 10 is installed but the repo has no `eslint.config.*` anywhere. Pre-existing, repo-wide, unrelated to this change. No lint config was invented for this pass (out of scope).

## 8. Backend test result

- `pytest ../tests -v` (scratch sqlite DB): **56 passed, 4 failed**
- The 4 failures (`test_firebase_exchange_*`, `test_forgot_password_*`, 2× group leave/handoff with `403 "Not a member"`) are in backend auth/group logic; this change touches zero backend files, so they cannot be caused by it (single-test rerun confirms a membership-logic assertion, e.g. `assert 403 == 200`)
- `tests/test_email_verification.py` fails at *collection* because the local dev `.env` contains a real `RESEND_API_KEY` the test asserts absent — environmental, pre-existing

## 9. Remaining issues

- Follow/unfollow buttons are ~32px tall; 44px guidance noted but rows are full-width tall targets, so left as-is
- Composer is single-line `<input>` (no multiline) — works correctly; auto-grow textarea deferred (needs device testing)
- `streaming`/`showContacts` legacy states left untouched where harmless

## 10. Known limitations

- No live-device verification (keyboard open/close, bottom-nav overlap, 360/375/390/412/768 widths) — needs a phone or emulator pass
- `any` types and nested row components predate this pass and were intentionally left alone per the no-large-refactor rule

---

# Final Verification (cleanup pass, commit after `958866d`)

## Fixed

- **Overlay covering nav**: root cause was the `ChatPanels` sheet (`z-50`) intentionally covering the nav (`z-10`) — modal architecture shared by every panel. Fixed without arbitrary z-index: new `.chat-panels-sheet` rule yields the nav area on mobile only (`bottom: nav height + safe-area`, desktop unchanged), and tab switches now `closeAllPanels()` first so panels replace instead of stacking. Verified live: sheet bottom == nav top (780px @390×844), tab button hittable, single sheet after switching.
- **44px targets**: follow pills `min-h-[44px]` (measured 69×44), full-width follow CTAs `min-h-[44px]`, all icon-only buttons `touch-44` class (measured 44×44: back/close/menu/plus/bell/trash/emoji/attach/photo/jump), segmented tabs `min-h-[44px]` (measured 174×44). Send/mic already 48px. Icons themselves unchanged in size.
- **Multiline composers**: channel + announce boxes are auto-growing textareas (35→57/76/102px measured for 2–4 lines, capped 128px, Enter=new line, Ctrl/Cmd+Enter or button sends). Testing exposed a real bug: height reset ran pre-commit under concurrent rendering, leaving the box stuck tall — fixed with a post-commit `useEffect` reset, verified collapsed (35px channel / 44px announce) after send.
- **Genuine backend bug fixed** (`backend/app/api/groups.py`, small + safe): invited members were never added (dead code under `continue` + early `return` in loop). This was the root cause of 2 failing tests; both pass now.

## Mobile verified

Real Chromium, local servers, fresh seeded DB — **VERIFIED** at 390×844:
- Communities: discover (dedup, no All-section duplication), search filter, open, Home/Groups/Members/About tabs, real online presence, 3-step create wizard → lands in new community, multiline announce → fans out with 📢 prefix, back navigation
- Channels: discover (Featured carousel, no All duplication), search, follow (44px, flips without reload), profile (Posts/Media/About), bell persists mute to localStorage, create wizard, multiline owner post (line breaks preserved, feed scrolls, composer never covers content)
- Chat regression: open group, send message, bubbles/checks/times render
- 360×800 and 412×915: `scrollWidth == innerWidth`, no horizontal overflow
- Console: **0 errors** throughout (only 2 pre-existing warnings)

## Desktop verified

- **VERIFIED at 1280px**: side-by-side list+chat, channel feed full-width, no clipping, composer visible
- **VERIFIED at 768px**: no overflow, 0 console errors
- Pre-existing (not a regression): desktop sidebar exposes no Communities/Channels entries (mobile-header is CSS-hidden ≥1024px) — recommend adding desktop entries as follow-up

## Backend tests

- Full suite, clean env (`RESEND_API_KEY` blanked), scratch DB: **60 passed, 0 failed** (excluding `test_email_verification.py` by design — see below)
- The 4 old failures, each closed:
  1. `test_firebase_exchange_…` — `ModuleNotFoundError: firebase_admin` in local venv. **PRE-EXISTING, environmental** (in `requirements.txt`, so CI/Render have it). Local venv restored to pinned `httpx==0.27.0` after diagnosis.
  2. `test_forgot_password_dev_…` — **PASSES with clean env**. Fails locally only because dev `.env` holds a real `RESEND_API_KEY`, so the endpoint (correctly, securely) takes the inbox branch. **PRE-EXISTING, environmental**.
  3. `test_group_self_leave_and_owner_handoff` — **GENUINE BUG, FIXED**, now passes.
  4. `test_group_owner_leave_promotes_member` — same root cause. **FIXED**, now passes.
- `test_email_verification.py` errors at collection by its own guard (asserts no `RESEND_API_KEY`, but dev `.env` has a real one) — **PRE-EXISTING, environmental**
- Environment lesson learned this session: sandbox restarts rotate backend JWT handling, invalidating minted tokens (`Invalid token` on stale sessions) — verification must mint fresh tokens per backend lifetime; no app impact

## Build

- `npx vite build` — **success (~50s)**, only the pre-existing chunk-size warning

## TypeScript

- `npx tsc --noEmit` — **clean** (also caught a missing `plural` import during this pass)

## Lint

- `npm run lint` — **still unrunnable**: ESLint 10 resolves globally, zero config files repo-wide, and `eslint` is absent from `devDependencies`. Re-investigated per instructions: the `lint` script was never set up. Reported as a **tooling gap**; no config invented (would be a tooling migration, out of scope).

## Remaining issues

- 32px→44px done via `touch-44`; emoji-strip glyph buttons (~40px) left as-is (large glyphs, tall row)
- Physical-device keyboard behavior **NOT VERIFIED** (no device available): inspected implementation (focus + scrollIntoView, safe-area padding, in-flow composer, no fixed heights) + Chromium typing/focus/autogrow tested as far as possible
- Desktop Communities/Channels entry points missing (pre-existing gap, needs product decision)

## Recommended next step

- Phone pass: real keyboard open/close on the new composers, bottom-nav overlap, 360/375/390/412 widths
- Then: desktop entries for Communities/Channels (the overlay work already supports them)
- Then: eslint flat config (separate tooling task)

---

# Final Verification (follow-up pass)

## Fixed

- **A. Follow buttons are 44px**: measured in-browser — `44×69px` on pills, `min-h-[44px]` on all Follow/Following variants (discover rows, profile, About, bottom-sheet CTA). Icon-only buttons left at 32px (app-wide convention; documented below).
- **B. Multiline composer**: channel post box and community announce box are now auto-growing textareas (35px → 102px measured at 3 lines, capped 128px, Enter=new line, Ctrl/Cmd+Enter or send button posts). **Testing caught a real bug**: height reset ran before React committed the empty value, leaving the composer stuck tall — fixed with post-commit `requestAnimationFrame` reset in both panels.
- **Genuine backend bug found and fixed** (`backend/app/api/groups.py`): invited members were never added (dead code under `continue` + early `return` inside the loop) — group creation silently dropped every invitee. Same root cause behind 2 failing tests. Both pass now.
- Announce toast grammar ("Announced to 1 group" via shared `plural`); About Created tile shortened to fit ("Oct 5").

## Mobile verified

Real Chromium via Playwright, local dev servers, fresh seeded DB — **VERIFIED**:
- 390×844: Communities discover (Trending dedup, no All-section duplication), detail Home/Groups/Members/About, announce composer → send → "Announced to 1 group" → activity feed updates with multiline post; Channels discover (Featured carousel, no All duplication), search filter, Following tab, channel profile (Posts/Media/About), bell persists mute to localStorage, 3-step create wizards for both, owner multiline post (line breaks preserved, feed scrolls, composer never covers content)
- Follow measured 44px tall, flips to Following without reload
- 360×800 and 412×915: `scrollWidth == innerWidth`, no horizontal overflow
- Chat regression: open group, send message, bubbles/checks/times render
- Console: **0 errors** across the entire session (5 errors appeared only after test servers were killed during teardown — dead-server fetch noise, not app errors)

## Desktop verified

- **VERIFIED at 1280px**: side-by-side list+chat, no stacking; overlay panels render full-screen consistent with all other panels
- **VERIFIED at 768px**: no overflow, 0 console errors
- Pre-existing gap (not a regression): desktop sidebar has no visible entry points for Communities/Channels (mobile-header is CSS-hidden ≥1024px) — recommend adding desktop entries as follow-up

## Backend tests

- Full suite, clean env, scratch DB: **60 passed, 0 failed** (excl. `test_email_verification.py`, see below)
- The 4 previous failures, each understood:
  1. `test_firebase_exchange_new_existing_unverified_rejected` — `ModuleNotFoundError: firebase_admin` in local venv. **PRE-EXISTING, environmental** (it is in `requirements.txt`, so CI/Render have it). Local venv was restored to pinned `httpx==0.27.0` after diagnosis (an install attempt briefly bumped it to 0.28.1 and broke collection — reverted and verified).
  2. `test_forgot_password_dev_returns_token_and_resets` — **PASSES with clean env**. Fails locally only because dev `.env` holds a real `RESEND_API_KEY`, so the endpoint (correctly, securely) takes the send-via-inbox branch instead of the dev token-in-response branch. **PRE-EXISTING, environmental** — and the code is right to prefer the inbox.
  3. `test_group_self_leave_and_owner_handoff` — **GENUINE BUG, FIXED** (see above). Now passes.
  4. `test_group_owner_leave_promotes_member` — same root cause. **FIXED**, now passes.
- `test_email_verification.py` errors at collection by its own design (asserts no `RESEND_API_KEY`, but dev `.env` has a real one) — **PRE-EXISTING, environmental**.

## Build

- `npx vite build` — **success (~33s)**, only the pre-existing chunk-size warning

## TypeScript

- `npx tsc --noEmit` — **clean** (also caught and fixed a missing `plural` import and a duplicate-style-prop issue during this pass)

## Lint

- `npm run lint` — **still unrunnable**: ESLint 10 installed but zero config files repo-wide, and `eslint` is not even in `devDependencies`. Investigated per instructions: the `lint` script is aspirational — linting was never set up. Reported as a **tooling gap**, no config invented (would be a tooling migration, out of scope).

## Remaining issues

- Icon-only buttons (bell/trash/menu, 32px) below the 44px guidance — app-wide convention, rows themselves are tall targets
- Overlays cover the bottom nav (must close panel before switching tabs) — pre-existing architecture shared by ALL full-screen panels, not a channels/communities regression; recommend nav-above-overlay + tab sync as follow-up
- Physical-device keyboard behavior (open/close/resize) not testable here — needs a phone pass
- Desktop entry points for Communities/Channels don't exist (pre-existing gap)

## Recommended next step

- Phone pass: real keyboard open/close on the new composers, bottom-nav overlap, 360/375/390/412 widths
- Then: desktop entries for Communities/Channels + nav-above-overlay tab switching (single layout change, benefits every panel)
- Then: eslint flat config (separate tooling task)
