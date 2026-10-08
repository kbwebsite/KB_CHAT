# WAVE PE-2D — Highlights (2026-10-08 UTC)

## 1. Objective

Expose Kryzen's existing Highlights capability as a polished product
surface using ONLY functionality already present in the repository —
**PATH B**: real backend + client, zero UI. No new tables, endpoints,
services, or speculative architecture.

## 2. Inspection findings (OBSERVED)

- "Highlights" in Kryzen = **Status Highlights** (permanent collections of
  one's own statuses), not message highlights. PE-1 audit P1-6 already
  recorded: "Highlights API fully implemented, zero UI."
- `grep highlight` over `frontend/src`: only CSS tap-highlight, search-jump
  flash CSS, `statusApi.highlights` client (`api.ts:331-336`), and an
  unrelated Channels local variable. **No component consumed the client.**
- AI help text (`provider.py`) already documents the intended UX
  ("View your status → Add to Highlight"), which never existed in UI.

## 3. Whether real Highlights existed (OBSERVED)

YES — backend + client complete, UI absent → **PATH B** (minimum frontend
wiring only). PATH C not taken; no blocker.

## 4. Architecture (OBSERVED)

`StatusHighlight 1—* StatusHighlightItem *—1 Status`, user-owned, ordered
by `position`. All mutations return the full `_highlight_to_dict`, so the
UI refetches/replaces from responses with no local math.

## 5. Storage/backend model (OBSERVED)

`models/highlight.py`: `status_highlights(id, user_id FK CASCADE, title≤50,
cover_status_id FK SET NULL, position, created_at)` +
`status_highlight_items(highlight_id FK CASCADE, status_id FK CASCADE,
position, added_at, unique(highlight,status))`. Deleted statuses cascade
their items away; missing rows are additionally skipped in serialization.

## 6. Actual endpoints/contracts (OBSERVED)

- `GET /api/status/highlights` → `[{id, title, cover, status_count,
  statuses:[{id, user_id, content, media_type, media_url, background,
  privacy, created_at}], created_at}]`, ordered by `position`.
- `POST /api/status/highlights {title}` (400 on blank).
- `POST /api/status/highlights/{hid}/items {status_id}` — highlight must be
  mine (404), status must be **mine** (404); idempotent "Already in
  highlight".
- `DELETE /api/status/highlights/{hid}` (404) — cascade deletes items.
- `DELETE /api/status/highlights/{hid}/items/{sid}` — idempotent remove.
- Frontend client pre-existed; only addition is optional `AbortSignal` on
  `list` (PE-2A pattern, no contract change).

## 7. Authorization (OBSERVED)

`get_current_user` on all routes; highlights strictly `user_id`-scoped;
items restricted to own statuses. No flaw found; nothing redesigned. Item
dicts carry no viewer fields — the UI enriches display name/avatar from the
signed-in user (items are provably own), never another user's data.

## 8. Creation behavior (OBSERVED + IMPLEMENTED)

No creation UI existed. Minimum wiring: title input + New (backend mandates
title), and per-highlight "Add from my statuses" picker (`statusApi.my`,
only addable rows enabled, already-added marked ✓). Mirrors the documented
"keep them forever" intent without inventing flows.

## 9. Manager architecture (IMPLEMENTED)

`HighlightsPanel` in the existing `ChatPanels` sheet (`showHighlights`,
mutually exclusive): create row, highlight cards (cover/title/count,
expand/collapse), item rows (thumb/snippet/remove), add-picker, loading
skeletons (`aria-busy`), error + Retry, empty states at both levels.
Refetch-after-mutate from server responses; abort on unmount; remount
refetches on every open — no polling, no new store, no cache.

## 10. Entry point (IMPLEMENTED)

Sidebar ⋮ → **Highlights** (Star icon, beside Reminders) via `onHighlights`
— same pattern as PE-2B/2C. Opens through `closeAllPanels`; closes via
panel X, desktop Escape, Android OS-back (shell handlers extended), or
opening the viewer.

## 11. Row design (IMPLEMENTED — contract fields only)

Highlight: cover (or Star), title, real `status_count`, expand + 44px
delete. Item: media thumb (or icon), text/caption snippet, 44px view +
remove. No invented counts/views/badges.

## 12. Ordering/pagination (OBSERVED + IMPLEMENTED)

Server `position` order preserved; items by `position`; no pagination
(bounded personal collections); no client resort, no infinite scroll.

## 13. Message navigation — N/A by architecture (OBSERVED)

Highlight items reference **Status rows, not messages**: there is no
conversation and no message id, so `handleSearchNavigate`/`jumpToMessageId`
do not apply. Item taps reuse the existing `StatusViewer` flow
(`onViewer(statuses, idx)`, same as `StatusPanel`), with viewer-required
fields enriched from the signed-in user. Nothing faked; limitation is
structural, documented here and in code.

## 14. Exact-jump behavior (OBSERVED — not applicable)

No message target exists (see §13). Within highlights, tapping an item
opens it at the exact index in the viewer (prev/next supported by the
viewer itself).

## 15. Remove/unhighlight behavior (IMPLEMENTED / VERIFIED)

Existing endpoints: item remove (failure → row kept + generic toast) and
highlight delete behind `confirm()` (matches `StatusPanel` delete pattern;
failure → kept + toast). Success → server-refetch + confirmation toast.

## 16. Mobile behavior (IMPLEMENTED / VERIFIED by inspection + tests)

Full-screen safe-area sheet; 44px create/expand/delete/view/remove
targets; `min-w-0`/`truncate` guards at 360–412 px; list + picker scroll;
Android-back closes first; no new gestures.

## 17. Desktop behavior (IMPLEMENTED / VERIFIED by inspection)

Standard panel at 1280×768; shell layout intact; full mouse + keyboard
operation (buttons, Enter-to-create, Escape close).

## 18. Accessibility (IMPLEMENTED / VERIFIED)

`role="dialog"` + `aria-label`; semantic `h2`; `aria-expanded` on
expand/add toggles; every control named (test asserts zero unnamed
buttons); `aria-busy` loading; no gesture-only path.

## 19. Privacy/security (OBSERVED + IMPLEMENTED)

Authorized `statusApi` calls only; strictly own highlights/statuses
server-side; no new persistence of content; no content in URLs/logs; no raw
errors. No flaw found.

## 20. Tests (VERIFIED)

`__tests__/highlights.test.ts` — **8/8 pass** against the mocked real
contract: loading→rows, empty, error + retry refire, create (title passed
through, refetch), expand + viewer open (enriched `display_name`, exact
index), item remove, delete with confirm, add-picker → `addItem(hid, sid)`,
named-controls + close. Existing suites untouched.

## 21. Build results (VERIFIED 2026-10-08)

- Backend full suite: **151 passed / 1 failed / 11 skipped** — the failure
  is `test_leaderboard_weekly_bounds_and_counts`, a PRE-EXISTING,
  unrelated test-isolation flaw (see below). Frontend changes cannot affect
  it (zero backend content changes in this task).
- Frontend full suite: **97 passed** (89 + 8 new), all files green.
- TypeScript `tsc`: clean, 0 errors.
- Vite production build: success (pre-existing chunk-size warning).
- `git diff --check`: clean on staged PE-2D files.

### Pre-existing backend failure — root-caused, not fixed (out of scope)

`test_leaderboard_weekly_bounds_and_counts` creates a user + 2 messages and
asserts the user appears in the default top-50 weekly leaderboard. Tests run
against the persistent dev sqlite `backend/kbchat.db` with no per-run wipe
(`create_tables()` only); the DB now holds **7574 accumulated users** from
repeated suite runs, saturating the top-50 with higher-count rows, so the
fresh 2-message user is absent. Fails solo too — deterministic, not a flake.
Fixing it means test-isolation work (DB reset scoping) and possibly deleting
local dev data — both out of PE-2D scope. Left untouched; test NOT weakened.

## 22. Files changed (IMPLEMENTED)

- `frontend/src/components/HighlightsPanel.tsx` (new) — manager UI.
- `frontend/src/components/__tests__/highlights.test.ts` (new) — 8 tests.
- `frontend/src/services/api.ts` — optional `AbortSignal` on
  `statusApi.highlights.list`.
- `frontend/src/components/ChatPanels.tsx` — `showHighlights` mount via
  existing `onStatusViewer`.
- `frontend/src/components/ChatSidebar.tsx` — `onHighlights` menu entry.
- `frontend/src/pages/ChatPage.tsx` — `showHighlights` state, close-all /
  Escape / back integration, sidebar + panel props.
- `.mece/cells/PRODUCT/WAVE_PE2D_HIGHLIGHTS.md` (this file).

## 23. Known limitations (OBSERVED)

- No conversation/message navigation (status-domain feature by design).
- Expired/deleted statuses vanish from highlights via cascade (server rule).
- No cover picker (no `cover_status_id` setter endpoint exists) — cover
  derives from `cover_status_id`, unsettable through the current API.
- No reorder UI (`position` is append-only via the API).
- Highlights are own-profile only; no sharing surface.

## 24. Deferred work (DEFERRED — not started)

PE-2E+, cover/reorder endpoints + UI (needs backend additions — reported,
not built), highlight sharing, theme pass (PE-5), backend test-isolation
fix for the leaderboard test, in-panel search.

## 25. PE-2E readiness

Highlights are additive (one panel, one menu item, one optional signal
param) on the proven PE-2B/2C shell patterns; viewer integration reuses the
untouched `StatusViewer`. Nothing structural changed, so PE-2E can proceed.
The leaderboard test-isolation issue is flagged above for whoever owns the
backend suite — it will keep failing regardless of product work until the
shared-DB accumulation is addressed.
