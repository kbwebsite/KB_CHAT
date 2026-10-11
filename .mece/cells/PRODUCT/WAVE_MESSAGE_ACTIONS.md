# WAVE — Message Action Scoping (2026-10-11 UTC)

## 1. Objective

The message action menu fired on everything, cluttering game cards and
media. Now: text keeps the full menu, game cards get no row actions,
photo/video get a slim dedicated menu. Frontend-only, zero backend changes.

## 2. Rules implemented

- **Game cards** (all 7: TTT/RPS/C4/Emoji/Chess/ToD/WC): no hover action
  bar, no More dropdown, no mobile tap sheet — the card is the UI.
- **Photo/video** (real attachments): Forward, Save, Select, Report
  (non-own), Delete + Info (own). Dropped: Copy, Listen, Pin, reminders,
  AI trio, quick-reactions row.
- **Text (+voice/files/etc.)**: unchanged full menu.
- Shared helpers in `messageEffects.ts`: `isGameCardMsg` (challenge
  prefixes, not hidden move markers) and `isMediaMsg` (image/video
  attachments, deleted-safe).

## 3. Notes

- Hidden game-move markers were already filtered from history; challenge
  cards needed the menu gate (this wave).
- Report stays reachable on media (moderation must never lose its entry);
  game cards carry only system text so there is nothing to report.
- Mobile sheet never opens for games (gated at the bubble tap source).

## 4. Tests (VERIFIED)

- `messageActions.test.ts` (5): helper units for all prefixes/negatives;
  bubble DOM — game card has no More/Reply and ignores taps, media menu
  has Forward/Save but no Copy/Summarize/Pin/reminders, text menu keeps
  all eight expected actions.

## 5. Build results (VERIFIED 2026-10-11)

- Frontend: **270 passed / 42 files**, no errors.
- Backend: **181 passed / 11 skipped** (untouched; an earlier full run
  showed 20 transient collection errors while the tree was being edited
  nearby — clean re-run green).
- `tsc`: clean. Vite build: success (pre-existing chunk warning).
- `git diff --check`: clean.

## 6. Files changed

- `frontend/src/utils/messageEffects.ts` — the two helpers.
- `frontend/src/components/MessageBubble.tsx` — gates + slim menu.
- `frontend/src/pages/ChatPage.tsx` — slim mobile sheet.
- `frontend/src/components/__tests__/messageActions.test.ts` — new.
- This report.
