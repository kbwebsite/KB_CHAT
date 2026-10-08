# WAVE PE-2G — Broadcast Membership Foundation (2026-10-09 UTC)

## Outcome: A) backend + frontend complete

## 1. Current architecture discovered (OBSERVED)

## 1. Current architecture discovered (OBSERVED)

- `BroadcastList` (`models/broadcast.py`): `id, owner_id FK users CASCADE,
  name≤100, member_ids JSON (default list), created_at`. **Membership is a
  serialized JSON id list — no membership table, no FK, no unique
  constraint at DB level.** Docstring: "works on SQLite + Postgres".
- Routes (`api/broadcasts.py`, plain HTTPException style, no service
  layer): list (owner-scoped, id DESC), create `{name, member_ids?,
  member_usernames?}` (self discarded, unknown ids skipped, ≥1 valid
  required), delete (owner 404), send `{content≤4000}` (per-member 1-1 DM
  fan-out, skips self/missing/blocked-either).
- `member_count = len(member_ids)`; `sent_to` = ids actually messaged.
- Deleted users: ids linger in JSON; send skips them (no cleanup pass).
- Blocks: creation ignores blocks; send skips blocked-either.
- No broadcast service module exists; no dedicated broadcast tests exist
  (only a comment mention in `test_api.py`).
- Limits: none on membership (only `content≤4000` on send).

## 2. Ten inspection answers

1. JSON list `broadcast_lists.member_ids`. 2. Serialized, not normalized.
3. `(id, owner_id)` — all routes scope by both. 4. Iterate stored ids at
send; skip self/missing/blocked. 5. `len(member_ids)`. 6. Id lingers;
skipped at send. 7. Skipped at send (either direction). 8. YES —
single-owner lists, tiny cardinality, read-modify-write + commit with
set-dedupe is safe; no migration needed (SQLite + Postgres JSON both
round-trip plain int lists). 9. Owner-only, 404-masked (same convention as
existing delete: non-existent and not-owned are indistinguishable).
10. No existing membership limits; send is synchronous per member, so the
new write path gets a conservative bound (MAX=50, see §4).

## 3. Proposed API contract (to implement)

- `GET /api/broadcasts/{id}/members` (owner, 404-masked) →
  `{success, data: {list: <standard _list_to_dict>, members: [{id,
  username, display_name, avatar_url}]}}`. Missing/deleted ids skipped in
  `members` (count stays truthful to stored ids). Bounded: members ≤ MAX.
- `POST /api/broadcasts/{id}/members {user_id? | username?}` (owner,
  404-masked) → `{success, data: <list dict>, message}`. Rules: exactly one
  target required (400); unknown user → 404 "User not found"; self →
  400 (create discards self — preserved); duplicate → idempotent 200
  "Already a member" (no duplicates, set semantics); list at MAX →
  400 "List is full"; blocks NOT checked at add (create doesn't either —
  send skips; semantics preserved, documented).
- `DELETE /api/broadcasts/{id}/members/{user_id}` (owner, 404-masked) →
  `{success, data: <list dict>}`. Absent id → idempotent 200 "Not a
  member" (RFC DELETE idempotency; deterministic). Self can never be
  present → same path.
- Ownership transfer: NOT invented. Owner deletion cascades the list (FK).
  No admin roles.

## 4. Limits / performance

`MAX_BROADCAST_MEMBERS = 50` (new write path only; legacy oversized lists
stay valid, add blocked until below cap). Rationale: send fans out
synchronously in one request; 50 keeps it bounded; WhatsApp-scale (256)
unjustified here. All member ops are O(members) in memory + 1 commit —
no N+1 (single user fetch per op; members resolution is one batched
`IN` query).

## 5. Database safety

**No migration.** No schema change (JSON column reused). No Alembic, no
`apply_fk_migrations.py` involvement. Concurrency note: concurrent
add/remove is last-write-wins on the JSON cell — acceptable at this
cardinality, documented here.

## 6. Service layer

New `services/broadcasts.py` (ServiceError + `service_route`, channels
pattern): `get_owned_list`, `resolve_member`, `list_members`,
`add_member`, `remove_member`. Routes stay thin.

## 7. Privacy/security

Owner-only + 404 masking (no existence/oracle leak); member dicts carry
only id/username/display_name/avatar_url (same as user search — no email);
no content in URLs (ids in path only for DELETE, matching saved-unsave
convention); blocks preserved at send.

## 8. Frontend implications → implemented (IMPLEMENTED / VERIFIED)

`BroadcastPanel` grew the minimal owner-only expandable members section
(all listed lists are owner-scoped, so no visibility gating needed):
member-count toggle → bounded member rows (avatar initial, name,
@username, 44px remove with confirm) → username input + Add (server
resolves; 404/400 surfaced inline; input preserved on failure). No
picker/directory/roles/bulk. `member_count`/`sent_to` usage unchanged.
Covered by `__tests__/broadcastMembers.test.ts` (6/6).

## 9. Files changed

- `backend/app/services/broadcasts.py` (new) — membership domain.
- `backend/app/api/broadcasts.py` — three member routes (thin).
- `tests/test_broadcast_members.py` (new) — 8 isolated tests.
- `frontend/src/services/api.ts` — members/addMember/removeMember.
- `frontend/src/components/BroadcastPanel.tsx` — members section.
- `frontend/src/components/__tests__/broadcastMembers.test.ts` (new).
- This doc.

## 10. Build results (VERIFIED 2026-10-09)

- Backend new tests: 8/8 pass. Full suite result reported in the phase
  summary (known leaderboard isolation failure expected; not weakened).
- Frontend: broadcast suites 16/16 (10 existing + 6 new); full suite +
  tsc + Vite build in the phase summary.

## 11. Limitations / deferred

- Last-write-wins on concurrent member edits (documented, acceptable).
- Legacy oversized lists stay valid; cap applies to new adds.
- Blocks checked at send only (creation parity).
- No roles/bulk/invites/analytics; no member messaging surface.
- PE-2H suggestion: read-receipt visibility for broadcasts, or the
  backend test-isolation fix (out of PE-2G scope per instructions).
