# WAVE PE-2B — Reminders Manager (2026-10-08 UTC)

## 1. Objective

Give users a way to inspect and manage the reminders that already exist in
Kryzen. Creation shipped earlier (message menu / action sheet); there was no
list/cancel surface (PE-1 audit P1-4). Scope is the manager UI plus the
smallest frontend primitives the existing abstraction lacked
(read/list + cancel). No backend, schema, sync, or notification work.

## 2. Existing reminder architecture discovered (OBSERVED)

- Fully **local**. No backend endpoint, no database table, no sync.
- Store: `frontend/src/utils/reminders.ts` — `localStorage` key
  `kb_reminders`, JSON array of `Reminder`. Module docstring states this
  explicitly ("Fully local … No backend needed").
- Creation: `scheduleMessageReminder({ convId, convTitle, msg }, 'hour' |
  'morning')` from `MessageBubble` menu ("In 1 hour" / "At 9 AM") and the
  `ChatPage` mobile action sheet (same two labels). Toast confirms with
  `formatFireAt`.
- No list/read or delete primitive existed — the manager adds exactly those
  two (`listReminders`, `cancelReminder`); everything else is reused.

## 3. Storage model (OBSERVED)

```ts
interface Reminder { id: string; convId: number | null; convTitle: string;
  sender: string; snippet: string; fireAt: number }
```

- `id`: `r<base36 time><random hex>`; `fireAt`: epoch ms
  (`now+1h` or `nextNineAM()`); `snippet`: 100-char `prettyPreview` (or
  `[attachment]`); `sender`/`convTitle` denormalized display strings.
- **No message id is stored** — exact source-message jump is structurally
  impossible (see §13). Survives reload (localStorage); per-browser, not
  user-scoped server-side (single local user in practice). Corrupt JSON
  reads as `[]` (shared rule, tested).

## 4. Reminder lifecycle (OBSERVED)

create → persisted → pending → (30 s ticker or boot tick pops due) →
fired (Notification + toast) + auto-removed; or cancelled → removed
immediately. No statuses, no history, no recurrence, no edit — the manager
shows exactly this: pending reminders only.

## 5. Scheduler/ticker behavior (OBSERVED)

`App.tsx:78-106`: boot tick + `setInterval(30000)` → `popDueReminders(now)`
(atomically removes due) → `new Notification('⏰ Reminder', …)` if
permission granted + toast always. Overdue items catch up at boot. The
manager adds no timer, no polling, no second scheduler; it refreshes on
mount, window `focus`, and cross-tab `storage` events.

## 6. Notification behavior (OBSERVED)

Fire-time popup (`Notification`) + toast `⏰ Reminder — {sender}: {snippet}`.
Desktop-notification and sound/vibrate prefs gate chat notifications, not
reminder popups (reminder path checks only `Notification.permission`).

## 7. Permission behavior (OBSERVED + VERIFIED)

`ensureNotificationPermission()` is called only from
`scheduleMessageReminder` (creation flow, best-effort). The manager never
requests permission — pinned by the `never requests notification permission
on open` test.

## 8. Manager UI architecture (IMPLEMENTED)

`frontend/src/components/RemindersPanel.tsx` — panel-shaped like
`SavedMessagesPanel` (header + scroll list + empty state), rendered in the
existing `ChatPanels` full-screen sheet (`showReminders`). Local state only
(`items`); chronological sort via `useMemo`; synchronous read (no fake
loading); corrupt storage → empty state (recoverable, no raw errors, no
retry needed since there is nothing to retry).

## 9. Entry point (IMPLEMENTED)

Sidebar `⋮` menu → **Reminders** (`BellRing` icon), beside Saved messages —
existing menu pattern (`menuFire`, `role="menuitem"`). Opens via
`closeAllPanels() + setShowReminders(true)` (mutually exclusive with all
other panels). Closes via panel X, desktop Escape, Android OS-back (both
route through the existing shell handlers, which now include reminders),
or opening a chat.

## 10. Reminder row design (IMPLEMENTED — only real fields)

Bell icon · `{sender} in {convTitle}` · `snippet` (2-line clamp) · fire time
via existing `formatFireAt` (`today/tomorrow at …`), or `Due now — fires
shortly` when `fireAt <= now` (derived from the real timestamp + known
30 s ticker — not a stored status). Per-row: `Open chat` (only when
`convId != null`) + `Cancel reminder from {sender}` (44px targets).

## 11. Sorting (IMPLEMENTED / VERIFIED)

Ascending `fireAt` (`[...items].sort`), covered by the chronological-order
test. Due-but-unpopped rows surface first with the `Due now` label,
consistent with the ticker popping them within ~30 s.

## 12. Delete/cancel behavior (IMPLEMENTED / VERIFIED)

Immediate, no confirmation — matches the existing unsave pattern and the
creation flow (which also has none); re-creating is one tap. Uses
`cancelReminder(id)` (same `writeAll` the ticker reads): UI filters the row
instantly + `Reminder cancelled` toast; cancelled ids can never fire;
reload preserves deletion (localStorage asserted in tests). Cancelling an
already-fired id returns `false` → panel resyncs + `already gone` toast
instead of lying.

## 13. Source-message navigation (IMPLEMENTED, limitation documented)

Row `Open chat` → shell `onJump(cid)` → the normal `handleSelect` path
(same as opening from the list). **Exact message jump is impossible**: the
stored schema has no message id, and inventing one (snippet search) would
risk jumping to the wrong message. The panel never claims otherwise — the
action is labeled `Open chat`, and rows without `convId` offer no open
action at all. No second message-loading system was created.

## 14. Mobile behavior (IMPLEMENTED / VERIFIED by inspection + tests)

Full-screen sheet with safe-area padding (existing `.chat-panels-sheet`);
header + 44px close/delete/open targets; `min-w-0`/`truncate`/`break-words`
guard 360–412 px widths; list scrolls (`overflow-y-auto`, `min-h-0`); no
keyboard traps; Android back closes the manager before navigating away
(`backRef` includes it); no new gestures; typing surfaces unaffected.

## 15. Desktop behavior (IMPLEMENTED / VERIFIED by inspection)

Same sheet pattern as every other panel at 1280×768; sidebar/chat layout
untouched; mouse + keyboard (all actions are buttons; Escape closes via the
shell handler).

## 16. Accessibility (IMPLEMENTED / VERIFIED)

`role="dialog"` + `aria-label="Reminders"`; semantic `h2`; every control
named (`Close reminders`, `Cancel reminder from X`, `Open chat X`) — a test
asserts zero unnamed buttons; decorative icons `aria-hidden`; no
gesture-only path.

## 17. Tests (VERIFIED)

`frontend/src/components/__tests__/reminders.test.ts` — **11/11 pass**
against the real abstraction (seeded localStorage, no storage
reimplementation): schedule→list→cancel round-trip, unknown-id cancel,
corrupt-storage rule, chronological order, metadata, empty state, delete
updates UI + persists, conversation open with real `convId`, no open action
without `convId`, due-now label, named-controls + close, no permission
prompt on open. Existing suites untouched.

## 18. Build results (VERIFIED 2026-10-08)

- Backend full suite: **152 passed / 11 skipped** (unchanged baseline).
- Frontend full suite: **80 passed / 10 files** (69 + 11 new).
- TypeScript `tsc`: clean, 0 errors.
- Vite production build: success (~24 s; pre-existing chunk-size warning).
- `git diff --check`: clean on staged PE-2B files.

## 19. Files changed (IMPLEMENTED)

- `frontend/src/components/RemindersPanel.tsx` (new) — manager UI.
- `frontend/src/components/__tests__/reminders.test.ts` (new) — 11 tests.
- `frontend/src/utils/reminders.ts` — added `listReminders` + `cancelReminder` (15 lines; no existing logic touched).
- `frontend/src/components/ChatPanels.tsx` — `showReminders` mount.
- `frontend/src/components/ChatSidebar.tsx` — `onReminders` menu entry.
- `frontend/src/pages/ChatPage.tsx` — `showReminders` state, close-all/Escape/back integration, sidebar + panel props.
- `.mece/cells/PRODUCT/WAVE_PE2B_REMINDERS_MANAGER.md` (this file).

## 20. Known limitations (OBSERVED)

- No exact message jump (no stored message id) — opens the conversation.
- No edit/snooze/recurrence/history — the underlying model has none.
- Single-device local storage — reminders do not roam; accepted existing
  architecture, not expanded.
- `Open chat` for a conversation the user has left still routes through the
  normal open path (same as tapping it in the list).

## 21. Deferred work (DEFERRED — not started)

PE-2C, saved-jump `mid`, highlights, broadcast members, AI surfaces, theme
pass (PE-5), any backend/sync/notification infrastructure, reminder
editing/snooze (needs schema + UX design first).

## 22. PE-2C readiness

The manager is additive (one panel, one menu item, two pure store
functions) and shares the shell patterns PE-2A proved. Nothing in shared
state, navigation, or the reminder lifecycle was restructured, so PE-2C can
proceed independently.
