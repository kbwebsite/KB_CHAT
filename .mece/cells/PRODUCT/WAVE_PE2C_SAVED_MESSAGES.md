# WAVE PE-2C — Saved Messages (2026-10-08 UTC)

## 1. Objective

Turn the existing backend-backed message-save capability into a useful
Saved Messages manager: real list, conversation context, exact message
jump (closing the PE-1 audit P1-5 gap where the jump dropped `mid`),
robust unsave, and proper loading/empty/error states — reusing the PE-2A
jump infrastructure. No backend, schema, or auth changes.

## 2. Existing save architecture discovered (OBSERVED)

- **Backend-backed.** `backend/app/api/saved.py` (`/api/saved-messages`) +
  `backend/app/models/saved.py` (`saved_messages`: `user_id`, `message_id`,
  `saved_at`, unique `(user_id, message_id)`, index on `user_id`).
- Frontend state: `ChatPage` holds `savedIds: Set<number>` (init-loaded),
  `handleSave` toggles save/unsave; `MessageBubble` menu + mobile action
  sheet expose Save/Unsave; entries already exist (sidebar ⋮ menu, command
  palette, welcome-header bookmark). A `SavedMessagesPanel` already existed
  and was already mounted — but it dropped `mid` on jump, had no
  error/retry, no failure-safe unsave, sub-44px icon-only buttons, and no
  conversation titles.

## 3. Storage/backend model (OBSERVED)

One row per (user, message). No client persistence of saves (server is the
source of truth; `savedIds` is a runtime cache only).

## 4. Actual endpoints (OBSERVED)

- `GET /api/saved-messages` → `{ success, data: [{ id, message_id,
  content, sender_username, sender_display_name, conversation_id,
  created_at, saved_at }] }`, ordered `saved_at DESC`, no pagination.
- `POST /api/saved-messages/{message_id}` → Saved / idempotent
  "Already saved"; 404 unknown message, 403 non-member.
- `DELETE /api/saved-messages/{message_id}` → Unsaved; 404 "Not saved".

## 5. Actual request/response contracts (OBSERVED)

List rows carry full display metadata (sender, content, both timestamps)
but **no conversation title** — only `conversation_id`. Deleted messages
surface as `content: "Message deleted"`; rows whose message row is gone are
skipped server-side. Frontend `savedApi = { list(signal?), save, unsave }`
(`services/api.ts:289`); only addition is the optional `AbortSignal` on
`list` (PE-2A pattern, no URL/contract change).

## 6. Authorization behavior (OBSERVED)

`get_current_user` on all three routes; list/save/unsave scoped to
`user_id`; save requires conversation membership (403 otherwise). List does
not re-check membership (saves survive leaving a chat) — pre-existing
server behavior, not altered. No authZ flaw found; no redesign undertaken.

## 7. Manager architecture (IMPLEMENTED)

`SavedMessagesPanel` rewritten in place (same mount points, no new nav):
loading skeletons (`aria-busy`), error + Retry, empty state, rows from the
real contract. Titles resolve from the already-loaded conversation list
(prop-drilled from `ChatPanels`, which already selects it — no new
subscription); unknown conversations render a factual "Chat" fallback, never
an invented name. Load is aborted on unmount; panel remounts on every open
(full `ChatPanels` unmount), so reopening always refetches — no polling,
no cache, no second store.

## 8. Entry point (IMPLEMENTED — wired, not duplicated)

Unchanged surfaces: sidebar ⋮ → Saved messages, command palette, welcome
header. All funnel into the existing mutually-exclusive `showSaved` panel.
The dead sidebar-internal `showSaved` branch (state never set true; live
path is `ChatPanels`) was left untouched as out of scope.

## 9. Saved-message row design (IMPLEMENTED — contract fields only)

Sender name (+ owning conversation title + `formatTime(created_at)` when
present) · 2-line snippet · `Open saved message …` jump button · 44px
`Remove saved message …` button. Deleted content shows the server's
"Message deleted" string verbatim. No counts, badges, or statuses.

## 10. Ordering/pagination behavior (OBSERVED + IMPLEMENTED)

Server order (`saved_at DESC`) preserved as-is; no client resort, no
`savedAt` invention, no pagination (bounded by the user's own saves —
matches the existing contract; no infinite scroll added).

## 11. Open/jump behavior (IMPLEMENTED / VERIFIED)

Row tap now calls `onJump(cid, mid)` with BOTH ids (previously `mid` was
dropped). `ChatPage` panel `onJump` is now the PE-2A `handleSearchNavigate`:
`mid` present → `jumpToMessageId` (normal history path +
`fetchMessages(cid, mid+1)`, then `pendingJump` scroll+flash onto
`msg-{mid}`); absent → normal `handleSelect`. Single-arg callers
(notifications/contacts/communities) behave exactly as before. No second
loader, no new chat state.

## 12. Unsave behavior (IMPLEMENTED / VERIFIED)

Existing `DELETE` endpoint. Failure → row kept + `Could not remove it`
toast (previously an unhandled rejection). Success → row removed instantly
+ parent `savedIds` synced via new `onUnsaveSaved` prop (bubble bookmark
icons no longer go stale) + confirmation toast.

## 13. Consistency/refresh behavior (IMPLEMENTED / VERIFIED)

Save (bubble/sheet) updates `savedIds` live; panel unsave syncs it back;
panel remount refetches on every open; reload re-inits from the server.
Tests pin row-removal and parent-sync on success, row-preservation on
failure.

## 14. Mobile behavior (IMPLEMENTED / VERIFIED by inspection + tests)

Existing full-screen sheet + safe-area padding; 44px close/unsave/jump
targets (were `p-2`); `min-w-0`/`truncate`/`break-words` guard 360–412 px;
list scrolls; Android-back/Escape close via the unchanged shell handlers;
no new gestures.

## 15. Desktop behavior (IMPLEMENTED / VERIFIED by inspection)

Panel fits the existing shell at 1280×768; sidebar/chat layout intact;
mouse + full keyboard operability (all actions are buttons; Escape closes).

## 16. Accessibility (IMPLEMENTED / VERIFIED)

`role="dialog"` + `aria-label`; semantic `h2`; named controls
(`Close/Open/Remove …`, test asserts zero unnamed buttons); `aria-busy`
loading region; named error/empty states; no gesture-only path.

## 17. Privacy/security (OBSERVED + IMPLEMENTED)

Only the existing authorized `savedApi` calls; server remains authZ source
of truth; no new persistence of message content (no localStorage/URL
params/logs); unsave failure surfaces a generic message, never raw errors.

## 18. Tests (VERIFIED)

`frontend/src/components/__tests__/savedMessages.test.ts` — **9/9 pass**
against the mocked `savedApi` contract: loading→rows with real titles,
unknown-conversation fallback, deleted-content display, empty state,
error + retry refire, jump called with `(cid, mid)`, unsave removes +
syncs parent, failed unsave preserves the row, named-controls + close.
Existing suites untouched. Exact scroll+flash itself remains covered by
the PE-2A store/panel tests; backend save endpoints by `tests/test_api.py`.

## 19. Build results (VERIFIED 2026-10-08)

- Backend full suite: **152 passed / 11 skipped** (one transient
  `test_forgot_password_dev_returns_token_and_resets` failure on the first
  run — unrelated email/password area, passes solo; clean 152/11 on rerun).
- Frontend full suite: **89 passed / 11 files** (80 + 9 new).
- TypeScript `tsc`: clean, 0 errors.
- Vite production build: success (~24 s; pre-existing chunk-size warning).
- `git diff --check`: clean on staged PE-2C files.

## 20. Files changed (IMPLEMENTED)

- `frontend/src/components/SavedMessagesPanel.tsx` — manager rewrite (same
  component, same mounts).
- `frontend/src/components/__tests__/savedMessages.test.ts` (new) — 9 tests.
- `frontend/src/services/api.ts` — optional `AbortSignal` on `savedApi.list`.
- `frontend/src/components/ChatPanels.tsx` — thread `conversations` +
  `onUnsaveSaved` into the panel.
- `frontend/src/pages/ChatPage.tsx` — panel `onJump` → `handleSearchNavigate`
  (exact jump), `onUnsaveSaved` syncs `savedIds`.
- `.mece/cells/PRODUCT/WAVE_PE2C_SAVED_MESSAGES.md` (this file).

## 21. Known limitations (OBSERVED)

- Jump to a deleted/cleared saved message opens the conversation without
  scrolling (`found=false`) — same honest fallback as PE-2A.
- Titles depend on the loaded conversation list; unlisted conversations show
  "Chat" (API provides no title).
- No in-panel search/filter (explicitly out of phase scope).

## 22. Deferred work (DEFERRED — not started)

PE-2D+, highlights, broadcast members, transcription/agent UIs, AI redesign,
theme pass (PE-5), in-panel search, backend/pagination redesign, reminders
changes (none made).

## 23. PE-2D readiness

Saved Messages is now exact-jump-capable through shared PE-2A plumbing with
no architectural deltas (one prop threaded, one callback swapped). The
panel/shell contract (`onJump(cid, mid?)`, `onUnsaveSaved`) is stable for
whatever PE-2D builds next.
