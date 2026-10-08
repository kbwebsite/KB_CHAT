# WAVE PE-2A — Global Search UI (2026-10-08 UTC)

## 1. Objective

Expose the EXISTING backend search capability through a polished,
production-ready, mobile-friendly Global Search surface. No backend search
architecture was redone; no database, auth, FTS, trigram, or Redis work.
Scope is the search UI plus the minimum frontend plumbing (AbortSignal
params, message-jump handoff, shell wiring).

## 2. Existing search APIs discovered (OBSERVED)

| Surface | Endpoint | Params | AuthZ (server-side) |
|---|---|---|---|
| People | `GET /api/users/search?q=&limit=` (`backend/app/api/users.py:25`) | `q` min_length=1, default limit 20, excludes self | any authenticated user; presence resolved via batched `presence_for_viewers` (Wave 4D) |
| Messages | `GET /api/messages/search?q=&conversation_id=` (`backend/app/api/messages.py:839`) | `q` min_length=1, optional `conversation_id` (403 if not a member) | member conversations only; `is_deleted` excluded; per-conv `cleared_before_id` excluded; over-fetch 100 → bounded 50 |
| Conversations | `GET /api/conversations?search=` exists (`convApi.list`), but Global Search filters the already-loaded conversation list client-side (title/description, top 20) — zero extra requests | — | list is already membership-scoped |

Wave 4D measured behavior (`.mece/cells/PERFORMANCE/WAVE4D_REPORT.md`):
search-hit 105→5 queries (128→55 ms), `users/search` 63→6 queries
(124→21 ms). No backend change was needed or made for PE-2A.

## 3. Actual request/response contracts (OBSERVED)

- `usersApi.search(q, signal?)` → `GET /api/users/search?q=` →
  `{ success, data: [{ id, username, display_name, avatar_url, is_online, last_seen }] }`.
- `msgApi.search(q, cid?, signal?)` → `GET /api/messages/search?q=[&conversation_id=]` →
  `{ success, data: [full message dicts: id, conversation_id, sender_*,
  content, created_at, message_type, is_deleted, ...] }`.
- Minimum query length is **1** on both endpoints (FastAPI `min_length=1`);
  the UI sends nothing on empty/blank queries and mirrors `MIN_LEN = 1`.
- Envelope is always `{ success, data }`; the UI additionally tolerates a
  bare array for robustness but never invents fields.

## 4. UI architecture (IMPLEMENTED)

- `frontend/src/components/GlobalSearch.tsx` — self-contained dialog; ALL
  state local (`query`, `people`, `messages`, `loading`, `searched`,
  `error`). No global store subscription except a read-only
  `conversations` selector for the client-side Chats filter and conv titles.
- Entry points reuse the existing shell (`ChatSidebar.tsx`): mobile header
  search icon + desktop search row, both `aria-label="Global search"`,
  both calling the existing `onSearch` prop pattern. No second nav system.
- Mounted once in `ChatPage.tsx` (`showSearch` state); closed via back
  button, X, backdrop click, or Escape. Android OS-back and desktop Escape
  both close search first (topmost layer) before any other back behavior.
- Reuses existing primitives: `useDebounce` (350 ms), `useEscapeKey`,
  `prettyPreview`, existing `bg-card`/`border-border`/`btn-primary` theme
  tokens, Lucide icons. Dark/light mode preserved (no hard-coded surfaces).

## 5. Search flow (IMPLEMENTED / VERIFIED)

type → `useDebounce(query.trim(), 350)` → parallel
`usersApi.search + msgApi.search` sharing ONE `AbortController` →
sequence guard (`seq` ref) discards stale resolutions → render 3 sections.
Empty query: no requests, hint state. Effect cleanup aborts the in-flight
pair, so query A can never overwrite query B (tested).

## 6. Result categories (IMPLEMENTED — nothing invented)

1. **People** — avatar (or initial), display name, `@username`,
   `· Online` only when `is_online` is true (both fields from the API).
2. **Messages** — sender name + owning conversation title (from the loaded
   list; falls back to "Chat"), 90-char `prettyPreview` snippet. No
   timestamps, counts, badges, or statuses shown — the API rows carry full
   message dicts but the UI shows only what aids scanning.
3. **Chats** — client-side title/description filter of loaded conversations
   (max 20, max 8 rendered), avatar or group icon, real `unread_count`
   only when > 0.

## 7. Message navigation (IMPLEMENTED / VERIFIED)

`openMessage` → `jumpToMessageId(cid, mid)` (store) + `onOpenConversation`
(shell). `jumpToMessageId` (`store/chat.ts:507`) reuses the NORMAL history
path: `setCurrent` + `fetchMessages(cid, mid + 1)` (before is exclusive, so
the target page is in the list), then sets `pendingJump { cid, mid, found }`.
`ChatView` (`ChatView.tsx:100`) consumes `pendingJump`: exact scroll +
flash (`msg-{mid}`, 1.8 s). If the target was cleared/deleted server-side,
`found=false` still opens the conversation rather than stranding the user.
No duplicate message-loading system; no new global chat state.

## 8. User navigation (IMPLEMENTED / VERIFIED)

Person row → `nav('/u/:username')` — the EXISTING profile route (`App:127`,
`UserPage`), which already offers start-chat (`participant_username`),
logged-out stash, and invalid-name errors. No new messaging flow; blocking/
privacy enforced server-side (search itself is membership/presence-scoped).

## 9. Conversation/group navigation (IMPLEMENTED / VERIFIED)

Chat row → `handleSearchNavigate(cid)` → same `handleSelect` path as the
normal conversation list (`setCurrent` + `fetchMessages` + mobile chat view).
Behaves exactly like opening from the list. Message rows with `mid` use the
jump path (§7) instead.

## 10. Mobile behavior (IMPLEMENTED / VERIFIED by inspection + tests)

- Full-screen surface (`h-full`, `sm:` dialog on desktop), dedicated
  `← Back to chats` button (`lg:hidden`, 44px) + `Clear search`/`Close`
  (44px) buttons; backdrop tap closes; Android back closes search first;
  Escape closes.
- Input focused on open (60 ms post-mount, keyboard-safe); results scroll in
  `overflow-y-auto`; `min-w-0`/`truncate` guards against horizontal
  overflow at 360/390/412 px widths; all row targets `min-h-[44px]`.
- No new gestures; typing never dismisses (backdrop is a sibling layer,
  input lives inside the panel); no scroll-locking code added.

## 11. Desktop behavior (IMPLEMENTED / VERIFIED by inspection)

Centered `sm:max-w-lg` / `max-h-[75vh]` dialog at 1280×768; sidebar/chat
layout untouched; mouse (rows, backdrop, buttons) + keyboard (type, Enter
activates first result, Escape closes) both work; focus moved to input on
open and restored to input on clear.

## 12. Accessibility (IMPLEMENTED)

`role="dialog"` + `aria-modal` + `aria-label="Global search"`; sr-only
`<label for="global-search-input">`; icon buttons all named (`Back to
chats`, `Clear search`, `Close search`, per-row `Open …` labels); loading
region `aria-label="Searching"` + `aria-busy`; decorative icons
`aria-hidden`; every action is a semantic `<button>` — no gesture-only path.

## 13. Debounce/cancellation (IMPLEMENTED / VERIFIED)

350 ms debounce (existing `useDebounce`); shared `AbortController` per round
+ monotonic `seq` guard; axios `ERR_CANCELED`/`CanceledError` mapped to
silent no-op (never a user-visible error); empty query short-circuits before
any request; no search history retained; selective store subscriptions only.
Covered by `debounces typing`, `does not call APIs on empty query`, and
`stale responses` tests.

## 14. Privacy/security (OBSERVED + IMPLEMENTED)

Frontend issues only the existing authorized axios calls (Bearer + cookie
refresh via interceptors). Server is source of truth: message search is
member-only with 403 on non-member `conversation_id`, deleted/cleared
excluded; user search excludes self. UI never renders raw errors (generic
"Search failed…" + Retry), never queries storage directly, never bypasses
authZ.

## 15. Tests (VERIFIED)

`frontend/src/components/__tests__/globalSearch.test.ts` — 16 tests,
mocked API contracts, real store jump, real MemoryRouter: closed/open
render, input hint, empty-query silence, debounce single-round, all three
categories, client-side chat filter, no-results, error + retry refire,
loading skeleton, clear reset, back + close buttons, profile route nav,
message jump (store `pendingJump` + shell callback), conversation open,
stale-result guard, Escape close, Enter first-result. **16/16 pass.**
Three tests were fixed during PE-2A (closed render needed a Router for the
unconditional `useNavigate`; category test query now matches the seeded
conversation; stale test now respects the 350 ms debounce) — no test was
weakened (all assertions kept or strengthened; 2 tests added).

## 16. Build results (VERIFIED 2026-10-08)

- Backend full suite: **152 passed / 11 skipped** (matches Wave 4D baseline).
- Frontend full suite: **69 passed across 9 files** (post-gesture baseline
  grew with new suites; GlobalSearch file 16/16).
- TypeScript `tsc`: clean, 0 errors.
- Vite production build: success (~31 s; pre-existing >600 kB chunk warning).
- `git diff --check`: clean on the staged PE-2A files.

## 17. Files changed (IMPLEMENTED)

- `frontend/src/components/GlobalSearch.tsx` (new) — dialog UI + flow.
- `frontend/src/components/__tests__/globalSearch.test.ts` (new) — 16 tests.
- `frontend/src/components/ChatSidebar.tsx` — mobile + desktop entry buttons.
- `frontend/src/components/ChatView.tsx` — `pendingJump` scroll+flash landing.
- `frontend/src/pages/ChatPage.tsx` — mount, `handleSearchNavigate`, search-first Escape/Android-back.
- `frontend/src/services/api.ts` — optional `AbortSignal` on the two search calls (no URL/contract change).
- `frontend/src/store/chat.ts` — `pendingJump` + `jumpToMessageId` + `clearPendingJump`.
- `.mece/cells/PRODUCT/WAVE_PE2A_GLOBAL_SEARCH.md` (this file).

## 18. Known limitations (OBSERVED)

- Exact jump depends on the target being fetchable via `before=mid+1`; a
  cleared/deleted message opens the conversation without a jump
  (`found=false`) — documented in-chat behavior, not faked.
- Chats section searches only loaded conversations (no server round trip);
  matches the sidebar's local filter semantics.
- Redundant double `jumpToMessageId` (row handler + shell navigate) — second
  call is abort-deduped and harmless; kept so the row works with any shell
  callback (as the test pins).
- No keyboard shortcut (Ctrl+K opens the command palette); entry is the
  sidebar search affordance on both form factors.

## 19. Deferred work (DEFERRED — not started)

PE-2B/2C, reminders manager, saved-jump `mid` fix, highlights UI, broadcast
members, AI consolidation, transcribe/smart-search UI, theme coherence
(PE-5), FTS/trigram/Redis/indexes, notification richness, full a11y pass.

## 20. PE-2B readiness

Global Search is self-contained (local state, existing APIs, existing
routes) and touches no shared architecture: PE-2B (reminders manager) can
proceed independently. Recommended next: reminders list/cancel on
`utils/reminders.ts`, reusing the same dialog/shell patterns proven here.
