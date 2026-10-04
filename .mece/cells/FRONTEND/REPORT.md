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
