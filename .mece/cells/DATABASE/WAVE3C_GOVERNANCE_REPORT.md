# WAVE 3C — Governance report (OD-W3-1 resolved + implemented)

## Decision

**SET NULL + frozen** for all three: ownerless communities/channels stay
visible and usable for members; admin actions deny fail-closed. No new
governance model, no transfer flow, no archiving — frozen is the emergent
behavior of the existing `owner_id != actor` gates, matching the
`messages.sender_id` precedent. Rationale and rejected alternatives
(CASCADE destroys shared content; archive needs product approval;
transfer unenforceable; RESTRICT bricks future deletion) in
`WAVE3C_GOVERNANCE_DESIGN.md`.

## Affected models

`models/community.py:22`, `models/channel.py:25,68` — `SET NULL` + nullable.
No relationship, route, service, or UI code changed (verified unnecessary:
gates deny on null by construction; sender/owner rendering already
null-tolerant; `types/index.ts` sender fields already `| null`).

## Database behavior (PG 16.2 staging, catalog-verified)

`fk_communities_owner_id` / `fk_channels_owner_id` /
`fk_channel_posts_sender_id`, all `SET NULL`, columns nullable YES, ledger
8/8. Owner delete → entity survives, FK nulls (incl. 100-post fan-out).

## API / UI behavior

Unchanged code. Ownerless state values: `owner_id: null`, `is_owner:
false`, `sender_*: null` — within existing contracts. UI badges/owner
panels hide; member reads continue; admin calls 403 (proven through the
real channel service layer).

## Migration

`06/07/08_*_setnull.sql` (nullable-first in-txn ordering) via the Wave 3B
runner (runtime name discovery, orphan preconditions 8/8 zero, in-txn
postconditions, ledger+checksums). Down files restore bare NOT NULL
originals (fail closed if NULLs exist — staging-only caveat documented).

## PostgreSQL tests

`test_fk_postgres.py` now 11/11 on staging PG: community freeze, channel
100-post fan-out freeze, service-layer 403s + surviving reads, gate
conditions, invalid-reference rejection. Fixture travels strip→migrate→
behave on an isolated DB (also re-proves the runner per run).

## Full regression

Backend **141 passed, 11 skipped** (140 + 1 metadata test; skips = 11
PG-gated locally). Frontend **25/25**, tsc clean. Vite not rerun (zero
frontend changes).

## Commit

`db: wave 3c ownerless governance set null` (this wave: 3 models, 3 SQL
pairs, registry+scans, 2 test files, 2 docs).

## Wave 3 complete?

**Yes, for the committed scope**: all 56 FKs now carry explicit ondelete
(41 CASCADE, 15 SET NULL), PG-verified end-to-end, mechanism + rollback
proven, governance trio resolved without new product surface.

## Remaining architectural work

Wave 4 distribution (rate-limit/WS/reset stores, export/status caps,
pagination/indexes) per audit roadmap. Open: OD-W3-2 staging sign-off
(evidence now exists to grant it), OD-W3-3 pseudo-relations, OD-5 auth
cutoff. Watch item: any future user-delete endpoint needs confirm-gating +
fan-out tests — CASCADEs are armed. ORM `delete-orphan` N+1 on huge
conversation deletes remains a future perf item (documented, untouched).
