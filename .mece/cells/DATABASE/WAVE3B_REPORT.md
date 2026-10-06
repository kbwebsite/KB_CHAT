# WAVE 3B REPORT — FK/ondelete implementation (5-relationship batch)

## 1–3. Changes / staging / orphans

- 5 model ondelete declarations (agent user/conversation, broadcast owner →
  CASCADE; conv created_by, msg reply_to → SET NULL) + migration mechanism
  (registry/runner/ledger/5 SQL pairs) + explicit CLI + 2 test files + 4 docs.
- **Staging PostgreSQL: UNAVAILABLE.** Verified: no listener on 127.0.0.1/
  localhost:5432, no docker, no local install, no `testing.postgresql`,
  pip binary fetch timed out (>120 s, no network path). Per hard-stop rules:
  no destructive execution, no faked staging, PG tests skip-gated.
- Orphan scans on local dev SQLite (36 tables): **5/5 zero**. Labeled local
  evidence only; staging re-scan mandatory (OD-W3-2).

## 4–6. Mechanism / verification / SQLite

- PG-only runner with ledger, runtime constraint-name discovery, per-txn
  pre/postconditions, checksums, `--scan-only`; boot untouched; SQLite →
  explicit `SkippedMigration` (verified). See WAVE3B_IMPLEMENTATION.md.
- PostgreSQL verification: **blocked (no server)** — 6 PG tests written,
  skipped honestly; SQL reviewed but unexecuted.
- SQLite: `PRAGMA foreign_keys=0` re-verified; model changes are behavioral
  no-ops there; new tables inherit correct DDL. No enforcement claimed.

## 7–8. Tests / rollback

- Targeted: 6 passed + 6 skipped. Backend total: **140 passed, 6 skipped**.
  Frontend/tsc/build rerun below. Rollback: per-migration down SQL (DDL
  revert safe pre-delete; post-delete recovery = snapshot restore).

## 9–11. Remaining / governance / next

- Remaining: `communities.owner_id`, `channels.owner_id`,
  `channel_posts.sender_id` — **not implemented** (OD-W3-1 open).
- OD-W3-1/OD-W3-2/OD-W3-3 all still open; OD-5 untouched.
- Next: provision staging PG → run PG suite + scans → execute `up` →
  Wave 4 or governance batch. Suggested commit: `db: wave 3b fk ondelete
  enforcement`.

## Validation rerun (Phase 7)

- Backend full: 140 passed / 6 skipped / 0 failed (above).
- Frontend vitest: 25 passed; `tsc --noEmit`: clean. Vite build not rerun
  (zero frontend files changed — nothing to build).
