# WAVE PE-2F — Channel Owner Edit UI (2026-10-09 UTC)

Location note: STEP 10 names `.mece/cells/PRODUCT_EVOLUTION/`, which does
not exist; PE-2A–2E reports live in `.mece/cells/PRODUCT/`, so this report
follows the established location.

## 1. Objective

Expose the existing real channel PATCH endpoint through a minimal,
production-quality owner edit experience. PE-2E identified "channel PATCH
has no UI yet" as the one remaining channel gap. No backend work, no
broadcast-membership changes, no Communities changes, no redesign.

## 2. Real PATCH contract discovered (OBSERVED)

- Route: `PATCH /api/channels/{channel_id}` (`api/channels.py:90`) →
  `services/channels.update_channel` (MISSING-sentinel partial update).
- Editable fields, exactly two: `name` (if key present: strip, blank →
  400 "Channel name required", truncated to 100) and `description` (if key
  present: stripped, empty/null → None i.e. cleared). Omitted keys stay
  unchanged. Unchanged values may be resent.
- Authorization: owner-only (`_require_owner`, 403 otherwise), 404 unknown
  channel. Server is authoritative; the UI additionally hides the action
  from non-owners.
- Response: full `_channel_to_dict` (same shape as list/follow results:
  id, name, description, owner_id, is_owner, followed, follower_count,
  post_count, created_at) — the UI swaps it in place, same as the existing
  follow flow. No refetch needed.
- Backend PATCH already has direct test coverage
  (`tests/test_channels_service.py:96-102`) — no new backend tests added.

## 3. UI added (IMPLEMENTED)

- `channelApi.update(id, {name?, description?})` (`services/api.ts`) — the
  helper lacked PATCH; only addition.
- Owner menu (channel profile ⋮) gains **Edit channel** (Pencil icon),
  rendered only for `is_owner`; opens a dialog preloaded with current
  name/description, reusing the create-wizard overlay pattern (bottom sheet
  mobile / centered desktop, backdrop-click closes, `useEscapeKey` closes).
- Dialog: labeled Name + Description inputs (create-form conventions,
  maxLength 100/500), autofocus, Enter-to-save on both single-line fields,
  Save (disabled while saving or blank name — duplicate-submit safe) +
  Cancel, inline error line, values preserved on failure, closes only on
  success, `Channel updated` notice via the existing `msg` pattern.
- Success path replaces the channel object from the response dict, so the
  header, rows, counts, follow state, posts, and owner identity all persist
  untouched — no reload, no second store.

## 4. Mobile/desktop/accessibility (IMPLEMENTED / VERIFIED by inspection + tests)

44px targets (inputs, Save/Cancel, close); `min-w-0` guards; keyboard never
traps Save (dialog scrolls, `max-h-[90dvh]`); Android-back closes the panel
(dialog lives inside the panel sheet; shell back/Escape close topmost
first; dialog has its own Escape); backdrop tap closes only when idle (not
mid-save, never while typing — backdrop is a sibling layer). Desktop
1280×768: `sm:max-w-md` centered dialog, hierarchy unchanged, no channel
regression. `role="dialog"` + `aria-label="Edit channel"`, labeled inputs,
named Save/Cancel/close; test asserts dialog controls are all named.

## 5. State/update behavior (IMPLEMENTED)

Refetch-after-mutate is NOT used here: the PATCH response is the full
channel dict, so in-place swap (existing follow pattern) is exact with zero
extra requests. Unmount safety: `savingEdit` guard + disabled backdrop/keys
during flight; stale responses impossible (single dialog, single flight).

## 6. Tests (VERIFIED)

`__tests__/channelEdit.test.ts` — **6/6 pass** vs the mocked real
contract: owner sees Edit / non-owner does not; preload + PATCH payload
(`{name, description}`) + immediate visible update + dialog close;
duplicate-submit prevented (button disables mid-flight); server failure
keeps dialog open with values + error shown, channel unchanged; Cancel
leaves everything unchanged; all dialog controls named. Backend PATCH
behavior stays covered by the existing service tests. Also added a jsdom
`scrollTo` stub (feed-scroll on channel open) — zero unhandled errors suite-wide.

## 7. Verification (VERIFIED 2026-10-09)

- Backend: **153 passed / 1 failed / 11 skipped** — the failure is the known
  pre-existing `test_leaderboard_weekly_bounds_and_counts` isolation flaw
  (shared dev sqlite holds 7500+ accumulated users, saturating the default
  top-50; root-caused in PE-2D, fails solo, zero backend content changes
  here). Not weakened, not touched.
- Frontend: **113 passed / 14 files**, no unhandled errors (107 + 6 new).
- TypeScript `tsc`: clean, 0 errors.
- Vite production build: success (pre-existing chunk warning only).
- `git diff --check`: clean on staged PE-2F files.
- PE-2E BroadcastPanel verified unchanged.

## 8. Files changed (IMPLEMENTED)

- `frontend/src/components/ChannelsPanel.tsx` — owner menu item, edit
  dialog, `saveEdit`, `useEscapeKey` + Pencil imports.
- `frontend/src/components/__tests__/channelEdit.test.ts` (new) — 6 tests.
- `frontend/src/services/api.ts` — `channelApi.update`.
- `.mece/cells/PRODUCT/WAVE_PE2F_CHANNEL_EDIT.md` (this file).

## 9. Limitations (OBSERVED)

- Name cannot be blanked (server 400 — surfaced inline); description blank
  clears it (server None semantics).
- No cover/branding/analytics/category fields — PATCH supports name +
  description only.
- Non-owner 403 path is server-enforced; UI hiding is convenience only.

## 10. Intentionally not implemented

Broadcast member add/remove (no backend endpoints — still deferred);
Communities changes; channel redesign; new backend fields/tests;
recommendation or analytics surfaces.

## 11. Recommended next phase

PE-2G candidates: broadcast member management (requires new backend
endpoints — design first); backend test-isolation fix (per-run DB reset)
to un-flake the leaderboard test; PE-5 visual-coherence pass.
