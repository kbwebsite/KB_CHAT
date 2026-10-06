# WAVE 3C — Governance design (OD-W3-1 resolution)

## Current behavior (evidence)

- Community/channel mutate paths are owner-gated by `owner_id !=
  current_user.id` (`communities.py:114,138,156,201,222`,
  `channels.py` service `_require_owner`). No transfer endpoint exists.
- Visibility is membership-based, not owner-based: community visible if
  owner OR linked-group member (`communities.py:48-61`); channel feed needs
  owner/follower (`channels.py:55-63`); channel list is public to authed users.
- API returns `owner_id` raw int (community) / `is_owner` bool (channel);
  no owner profile is ever embedded.
- Frontend compares `owner_id === user.id` / `is_owner` for badges and
  owner-only UI (`CommunitiesPanel.tsx:249,285`,
  `ChannelsPanel.tsx:193,400,419,451…`); no owner name is displayed
  anywhere. Null-safe by construction (`null === id` is false).
- Channel-post sender fields are already null-tolerant server-side
  (`sender.username if sender else None`) with `|| 'Someone'/'Unknown'`
  fallbacks in 6+ components.
- No user-delete/deactivate endpoint exists (grep-verified) — all owner
  hazards are latent arming, not live behavior change.

## Decision: SET NULL + frozen (no new governance model)

When the owner/sender row disappears, the FK nulls and the entity **stays
visible and usable for members, with admin actions denied**:

- Community: groups keep working, members keep browsing; edit/delete/
  link/announce 403 for everyone (emergent from existing `!=` checks —
  zero code change).
- Channel: followers keep reading; post/edit/delete/follow-toggle… note
  follow/unfollow are NOT owner-gated (any authed user) so they keep
  working; owner-only post/edit/delete 403.
- Channel post: content survives with anonymous sender display (existing
  fallbacks).

## Why not the alternatives

- CASCADE: destroys shared member content (others' groups links, followers'
  feeds, posts) on a single account removal — strictly worse, contradicted
  by the membership-based visibility model.
- Archive-on-delete: needs a new status column, new UI states, and product
  approval — a product feature, not an FK fix. Not required for integrity.
- Transfer-before-delete: unenforceable — no delete-user flow and no
  transfer endpoint exist; inventing both is out of scope.
- RESTRICT: bricks any future account deletion with no admin UX to resolve.

Frozen-on-null is the emergent status quo ante (what the code already does
when the comparison fails), matching the `messages.sender_id` precedent.
No UI changes needed (verified null-safe above); no API shape changes
(`owner_id: null`, `is_owner: false`, `sender_*: null` — all within existing
nullable-typed contracts: `types/index.ts:27,73-74` sender fields already
`?: string | null`).

## Database / API / UI / authz behavior

- DB: `SET NULL` on all three + nullable columns.
- API: unchanged code; changed values only in the owner-gone state.
- UI: unchanged code; owner badges simply stop appearing for anyone.
- Authz: unchanged code; owner gates deny (fail-closed) when null.

## Migration implications

- PG: `ALTER COLUMN DROP NOT NULL` + constraint swap per table (same txn,
  same mechanism as 3B; nullable-first ordering inside each migration).
- SQLite: old dev DBs keep NOT NULL DDL (unenforced, harmless); new DBs get
  nullable. `_ensure_missing_columns` cannot drop NOT NULL — documented,
  dev-only.
- Orphan scans must be zero (expected: no user-delete path exists).

## Unresolved questions: none blocking.

Governance follow-up (heir/admin-takeover UX) remains possible product work
but is NOT required for integrity — frozen is safe and explicit.
