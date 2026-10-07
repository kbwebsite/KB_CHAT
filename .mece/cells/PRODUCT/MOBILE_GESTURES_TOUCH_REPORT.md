# Mobile gestures & touch UX — report

## 1. Scope

Touch dismissal/gesture polish only: shared hooks, BottomSheet swipe,
forward-dialog dismissal, Lightbox swipe nav, conversation long-press,
touch targets, Esc/backdrop consistency. No features, no backend, no
redesign, no gesture framework.

## 2. Existing behavior (OBSERVED before changes)

- BottomSheet: overlay click + history-pop close worked; swipe was
  `dy > 80` from ANYWHERE on the sheet (incl. scrollable content), no
  velocity, no reduced-motion handling, no dialog semantics, Done button
  below 44px.
- Message actions sheet, Lightbox (Esc/history/pinch), CommandPalette
  (Esc/backdrop) already dismissible. Forward dialog: X/Cancel only —
  no backdrop, no Esc, no scroll lock.
- Conversation rows: ⋯ button only (PE-1), no long-press; no touch handlers
  anywhere except BottomSheet/Lightbox pinch.
- ChatHeader menu: backdrop but no Esc, ~36px items.
- Lightbox zoom/download/close buttons 32px.
- Browser Back closed BottomSheet/Lightbox via history; Android back
  walker covers panels/sheets in ChatPage.

## 3. Problems found

Same list as §2, plus: `chat-header-back` 40px; RowMenu ⋯ 36px.

## 4–7. Implemented

- `hooks/useDismiss.ts` (new): `useEscapeKey`, `shouldDismissSwipe`
  (>120px, or >40px at >0.5px/ms; never upward/tiny), `exceedsTolerance`,
  `useLongPress` (Pointer Events, 500ms/10px, cancels on move/up/cancel/
  leave, suppresses the release click, contextmenu only when fired).
- BottomSheet: gesture starts ONLY on handle/title chrome
  (`data-sheet-chrome`, `touch-action:none` there) — content scroll,
  inputs, sliders untouched; `role=dialog aria-modal`; focus to Done on
  open; 44px Done.
- Forward dialog: backdrop close + Esc + `modal-open` scroll lock +
  dialog semantics + 44px close.
- Lightbox: single-finger horizontal swipe (>60px, <40px vertical) to
  move between media; pinch path untouched; 44px zoom/download/close.
- Conversation rows: long-press opens the SAME RowMenu (same actions);
  tap/scroll unaffected via tolerance + click suppression; 44px ⋯.
- ChatHeader menu: Esc + 44px items. Back button CSS 40→44px.

## 8. Edge-back decision: DEFERRED

Browser history-back already works for sheet/lightbox routes; Android
back walker covers panels. In-app edge-swipe would risk carousels,
games, horizontal media scroll and browser-native gestures with no
safe scoping available — not forced.

## 9. Touch targets

Fixed: sheet Done, forward X, lightbox zoom/download/close, row ⋯,
header menu items, back button. Icons unchanged (hit areas only).

## 10. Scroll-conflict safeguards

Gestures scoped to chrome/handle regions; `touch-action: pan-x pan-y`
on pressable rows (scroll keeps working, moves cancel); no
`preventDefault` on touch paths; no global scroll changes; long-press
only on row containers, never on interactive children/text.

## 11. Accessibility

Every gesture duplicates a visible control (⋯, Done, X, arrows, menu
buttons); keyboard paths intact (Esc added, never removed); menu/dialog
roles + `aria-expanded/haspopup/label/modal` kept; focus moves into
sheets. Reduced motion: no new animations added (close is instant state
change); existing CSS path untouched.

## 12–13. Mobile/desktop verification

No browser automation in this environment — verified by construction
(44px, overflow guards, existing breakpoints reused), tsc, unit tests,
and production build. Desktop: mouse/hover/keyboard/Esc paths preserved
(all additions are additive listeners). Stated plainly: no device run.

## 14. Tests

New `hooks/__tests__/dismiss.test.ts` (9): swipe thresholds/velocity,
tolerance, fire/tap/move-cancel/click-suppression/ordinary-click via
real DOM PointerEvents.

## 15. Build results

Backend 152/11 skipped · frontend 53/53 (44+9) · tsc 0 · vite success ·
diff-check clean.

## 16. Files changed

`hooks/useDismiss.ts` + `hooks/__tests__/dismiss.test.ts` (new);
`BottomSheet.tsx`, `ChatModals.tsx`, `Lightbox.tsx`,
`ConversationList.tsx`, `ChatHeader.tsx`, `index.css` (44px back).

## 17. Known limitations

No device verification; edge-back deferred (see §8); BottomSheet has no
live-drag follow (open/close transitions unchanged); DeleteDialog keeps
backdrop-dismiss (choice dialog with explicit Cancel — accepted).

## 18. PE-2 readiness

Touch layer consistent; PE-2 (search/reminders/saved) can reuse
`useEscapeKey`/sheet patterns directly.
