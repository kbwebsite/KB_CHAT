# WAVE 3B — Migration guide (operator-facing)

## Mechanism

Versioned SQL + ledger (`applied_fk_migrations`), PG-only, explicit runner:
`python scripts/apply_fk_migrations.py [--direction up|down]
[--database-url ...] [--scan-only]`. Never runs at boot/import.

## Preconditions (enforced by runner, fail-closed)

1. Postgres dialect (else skip, exit 3).
2. Table + bare FK present (else `MigrationError`: schema differs).
3. All 5 orphan scans zero (else abort, report label+count).
4. Not already applied (ledger) — else `already-applied`; DDL already at
   target (fresh DB) → recorded as `already-converged` (not silent).

## Postconditions

Inspector re-check inside the same transaction; mismatch → rollback +
`MigrationError`. Ledger row commits WITH the DDL (atomic).

## IDs / checksums

`01…05_*` in `MIGRATIONS` order; sha256 of file bytes stored per apply
(drift detection: re-running with edited files is a new-ID event — edit
SQL only by adding a new migration, never rewriting a recorded one).

## Staging order (when PG exists)

1. `pg_dump` snapshot + row counts. 2. Load representative data.
3. `--scan-only` (expect all zero). 4. `pytest tests/test_fk_postgres.py`
with `TEST_PG_URL` (expect 6 passed). 5. `--direction up`.
6. Re-scan + inspector DDL diff + app boot smoke. 7. Keep snapshot for
rollback window.

## Production ordering

Snapshot → maintenance-safe window (ALTERs take brief ACCESS EXCLUSIVE
locks; small tables, seconds) → `--scan-only` → `--direction up` →
smoke (login/send/refresh/ws) → retain snapshot ≥ one release.

## Rollback

`--direction down` restores bare constraints (safe pre-delete). After any
production CASCADE delete, data recovery = snapshot restore (runbook owned
by deploy; constraint reversal alone recovers nothing).

## Destructive-delete warning

CASCADE migrations make future user-deletes erase ~20 tables per user in
one transaction. No user-delete endpoint exists today; when one is built it
needs confirm-gating + fan-out tests. This migration does not delete data —
it only arms the constraints.
