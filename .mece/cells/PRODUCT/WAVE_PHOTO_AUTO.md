# WAVE — Photo Polls + Away Auto-Reply (2026-10-11 UTC)

## 1. Objective

Two requested features, both frontend-only, zero backend changes.

## 2. Photo polls

Poll options can carry photos: the create form has a per-option photo
button (upload via existing `uploadApi`, URL absolutized and appended to
the option text, 500-char cap respected). Cards render the photo thumb +
caption via new `splitOptionMedia` (image-URL-in-text convention, same as
channel posts). Quiz select, votes line, and results all show captions,
never raw URLs. Backend stores plain text — no schema change by design.

## 3. Away auto-reply

Per-chat auto-reply (local-only, like wallpapers): header extras menu →
Auto-reply panel with toggle + custom message. On incoming messages the
store hook replies once per conversation per hour through the normal send
path (optimistic UI + retry). Guards: own messages skipped, game markers
skipped, hourly cap is the ping-pong guard, silent failure, app-open only.
Honest limits documented in UI and code.

## 4. Tests (VERIFIED)

- `pollSuggest.test.ts` (+6): media splitting, upload-into-option,
  card photo render, non-image rejection, honest upload failure.
- `autoReply.test.ts` (new, 6): defaults, persistence, caps/fallbacks,
  hourly cooldown, corrupt storage, per-conv independence.
- `autoReplyPanel.test.ts` (new, 2): header-menu entry, toggle+text
  persistence, stored config display.

## 5. Build results (VERIFIED 2026-10-11)

- Frontend: **234 passed / 36 files** (210 + 24 new), no errors.
- Backend: **176 passed / 11 skipped** (untouched code, green baseline).
- `tsc`: clean. Vite build: success (pre-existing chunk warning).
- `git diff --check`: clean.

## 6. Files changed

- `frontend/src/components/PollPanel.tsx` — photo buttons + card media.
- `frontend/src/components/ChatView.tsx` — auto-reply panel + extras case.
- `frontend/src/components/ChatHeader.tsx` — `autoreply` key + menu item.
- `frontend/src/store/chat.ts` — receive-path auto-reply hook.
- `frontend/src/utils/autoReply.ts` — new local store.
- `frontend/src/components/__tests__/pollSuggest.test.ts` — extended.
- `frontend/src/utils/__tests__/autoReply.test.ts` — new.
- `frontend/src/components/__tests__/autoReplyPanel.test.ts` — new.
- This report.

Note: the earlier Would-You-Rather deck work remains uncommitted in the
tree alongside this wave (separate feature, separate commit).
