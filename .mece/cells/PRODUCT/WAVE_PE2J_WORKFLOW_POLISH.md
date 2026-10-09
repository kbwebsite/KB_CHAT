# WAVE PE-2J — Core Chat Workflow Polish (2026-10-09 UTC)

## 1. Objective

Reliability pass over сохран core chat workflows (search/saved jumps,
reminders, mobile dismissal). Read-only audit first; only verified,
reproduced defects fixed with small targeted changes. No redesign, no
backend changes.

## 2. Audit findings (OBSERVED)

Verified healthy: GlobalSearch debounce/seq/abort; SavedMessagesPanel
abort; fetchMessages per-conv abort+seq; ChatView pendingJump consume;
reminders local lifecycle (persist, boot catch-up, atomic pop, permission
guards, cancel); backRef/Escape search-before-panels ordering.

Defects (all reproduced in code, fixed below):
1. `jumpToMessageId` published `pendingJump` unconditionally — a slow/
   aborted earlier jump settling after a newer one overwrote the landing
   (last-completed won, not last-initiated). Wrong-message scroll.
2. In-conversation `jumpToMessage` fetched only the latest page: jumps to
   old messages outside the window silently missed their scroll target.
3. Jump/open to a deleted/unknown conversation stranded the UI on an
   infinite "Loading conversation..." spinner (`setCurrent` to an id with
   no store entry and no recovery).
4. Escape in mobile chat view bypassed open overlays (lightbox, viewer,
   panels, sheets) and navigated straight to the list.
5. Escape list-view branch missed GroupInfo/Agent/Leaderboard/Theme
   panels (closeAllPanels covered them; the branch did not).
6. Dismissal order vs paint order: ChatModals children (later DOM, same
   z-50) paint above GlobalSearch, but search was dismissed first — first
   press appeared to do nothing. DeleteDialog/MessageInfo (z-90) were not
   handled by OS-back at all.
7. (Found during fix verification.) GlobalSearch self-dismissed on Escape
   alongside the shell → double-layer dismissal. Removed; shell owns
   Escape (search is ChatPage-only).

Reminders: no defects. Fired-notification click focuses the window by
design; panel Open chat covers navigation; dead-conversation edge now
funnels into fix 3.

## 3. Fixes (IMPLEMENTED)

- `store/chat.ts`: module `jumpSeq` — only the newest jump publishes
  `pendingJump` (stale returns false); unknown conversation refreshes the
  list once (valid-but-unlisted still jumps), then resets to null when the
  conversation is absent AND (load failed OR target missing). Known-conv
  missing-target fallback unchanged.
- `ChatView.tsx`: `jumpToMessage` routes through `jumpToMessageId`
  (orphaned manual scroll block removed; landing effect comment updated).
- `ChatPage.tsx`: single `closeTopMost()` paint-order dismissal (z-90
  dialogs → action sheet → forward/palette/viewer/lightbox → search →
  panels → inline search; ringing calls excluded), shared by Escape and OS
  back; Escape else-branch reduced to composer state (panels via
  closeAllPanels); `closeTopRef` mirror keeps the window listener fresh
  without re-subscribing.
- `GlobalSearch.tsx`: removed standalone `useEscapeKey` (shell owns it).

## 4. Files changed

- `frontend/src/store/chat.ts`, `frontend/src/components/ChatView.tsx`,
  `frontend/src/pages/ChatPage.tsx`, `frontend/src/components/GlobalSearch.tsx`
- `frontend/src/store/__tests__/chat.jump.test.ts` (new, 5),
  `frontend/src/components/__tests__/chatJump.test.ts` (new, 1),
  `frontend/src/pages/__tests__/chatShell.test.ts` (new, 3),
  `frontend/src/components/__tests__/globalSearch.test.ts` (1 test
  re-pinned to shell-owned Escape — behavior preserved at shell level)
- This report.

## 5. Verification (VERIFIED 2026-10-09)

- Backend: **170 passed / 11 skipped**, 0 failures (PE-2H isolation held).
- Frontend: **133 passed / 19 files** (124 + 9 new), no unhandled errors.
- `tsc`: clean. Vite build: success (pre-existing chunk warning only).
- `git diff --check`: clean.
- Mobile/desktop/a11y: no layout or token changes; all controls pre-existing.

## 6. Limitations / deferred

- Component self-Escape handlers (BottomSheet, StatusViewer, forward
  picker, palette) remain — idempotent with the shell, used in multiple
  contexts; unifying them is a broader refactor, out of scope.
- Unknown-conv reset triggers an extra list refresh only in that path.
- In-conv jump now marks read via `setCurrent` (consistent with every
  other conversation open).
