# WAVE 3B — Test report

## Targeted (new)

- `tests/test_fk_models.py`: **6 passed** — metadata ondelete ×5, SET NULL
  nullability ×2, orphan scans zero (5/5), SQLite non-enforcement documented
  (`PRAGMA foreign_keys=0` assertion — fails loudly if ever flipped),
  registry coherence (ordering/unique IDs/files/sections/checksum presence),
  runner refuses SQLite (`SkippedMigration`).
- `tests/test_fk_postgres.py`: **6 skipped** — real PG enforcement tests
  (user→agent chain, broadcast cascade, created_by nulling, reply survival,
  invalid-reference rejection, orphan-free deletes). Skip gate: TCP probe of
  `TEST_PG_URL`/localhost:5432. NOT faked; run on staging.

## Orphan scans (local dev SQLite, `backend/kbchat.db`, NOT staging)

`scripts/apply_fk_migrations.py --scan-only`: all 5 relations **0 orphans**
(36 tables present). Recorded as data-integrity evidence only — staging
re-scan is mandatory before prod ALTERs (OD-W3-2).

## Full regression

- Backend: **140 passed, 6 skipped, 0 failed** (134 + 6 new).
- Frontend: untouched (no files changed) — 25/25 + tsc from Wave 2 stand;
  rerun recorded in WAVE3B_REPORT.
- No existing test modified; two pre-existing suites re-verified implicitly
  (agent delete, message delete paths exercise the touched FKs via ORM).
