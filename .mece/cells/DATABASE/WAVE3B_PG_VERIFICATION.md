# WAVE 3B — PostgreSQL verification checkpoint (2026-10-07 UTC)

This is a NEW checkpoint. It does not rewrite WAVE3B_REPORT (whose PG steps
were honestly marked unexecuted at commit `e69243d`).

## Environment

- Isolated embedded PostgreSQL **16.2** (pgserver, `x86_64-pc-mingw64`),
  data dir in system temp (never production, never the dev SQLite DB).
- Two databases used: `postgres` (main staging: full 36-table app schema +
  representative seed) and `kbchat_fktest` (auto-created/dropped per PG
  test-module run) plus disposable `staging_rb` (rollback test, dropped).
- Mechanism fixes made during verification are committed alongside
  (smallest-required-fix rule, §13): see "Defects found".

## §3 Pre-migration FK state (catalog-verified)

All five bare (`NO ACTION`), auto-named (`*_fkey`), nullability as specified:

- `agent_conversations.user_id` NO ACTION, NOT NULL
- `agent_messages.conversation_id` NO ACTION, NOT NULL
- `broadcast_lists.owner_id` NO ACTION, NOT NULL
- `conversations.created_by` NO ACTION, nullable YES
- `messages.reply_to_id` NO ACTION, nullable YES

## §4 Orphan scans (staging, seeded: 3 users, agent chain, broadcast, group + reply)

`--scan-only` via the real CLI: **5/5 zero**.

## §5 Migration execution (real CLI, `up`)

`01…05: applied` (first run). Ledger `applied_fk_migrations` holds 5 rows
with sha256 checksums (recorded: db3fac05…, adc2f444…, ecb22eb3…, 421fc25…,
e55f8fea…).

## §6 Post-migration catalog inspection

All five explicit constraints with exact actions (`fk_*` names, CASCADE ×3,
SET NULL ×2) — PASS.

## §7 PG tests: 6 passed, 0 failed, 0 skipped

`TEST_PG_URL` pointed at staging; fixture builds an isolated DB that travels
strip→migrate(up)→behave→drop. Covers CASCADE chains, both SET NULLs,
invalid-reference rejection, orphan-free deletes.

## §8 Behavioral delete proofs (on PG, isolated data)

- A agent chain: user delete → conv + messages gone.
- B broadcast: user delete → list gone.
- C created_by: user delete → conv survives, NULL.
- D reply: parent delete → reply survives, NULL.
All asserted in the passing PG suite. Side finding (test-level only):
ORM objects expired by DB cascades raise `ObjectDeletedError` on touch —
tests capture ids pre-delete; no app impact (no user-delete route).

## §9 Idempotency

Second `up`: 5× `already-applied`, no duplicates, ledger unchanged. Fresh-DB
`already-converged` path also verified (rollback-test setup).

## §10 Rollback (disposable `staging_rb`, dropped after)

`down`: 5× `rolled-back`; all five constraints back to bare `NO ACTION`;
ledger empty. PASS. Production rule stands: DDL revert safe pre-delete;
post-delete recovery = snapshot restore.

## §11 Full regression

- Backend: **140 passed, 6 skipped** (PG suite skips locally by gate).
- PG suite on staging: **6/6**. Frontend vitest **25/25**, tsc clean.
- Vite build not rerun (zero frontend files changed).

## Defects found (fixed, minimal)

1. `current_ondelete` read PG inspector `options['ondelete']`, which PG16
   leaves empty → every bare FK misread as missing. Now uses
   information_schema (the only reliable source).
2. `_statements` split on `;` before stripping comments → comment-only and
   comment-fragment chunks executed (empty-query + syntax errors). Now
   strips full-line comments first (SQL convention documented); also fixed
   transaction-safety note: failures roll back the whole batch (observed).
3. Down-migration assumed explicit constraints exist; fresh-DB `converged`
   rows carry auto-named ones → rollback left ghosts. Runner now drops ALL
   discovered names pre up/down.
4. Test fixture used partial metadata + shared DB (`drop_all` FK-order
   failure); now isolated database via real strip→migrate path.

## Remaining

Governance trio untouched. Wave 3B is now **fully verified** end-to-end on
PostgreSQL 16. OD-W3-1/OD-W3-2(staging sign-off now available as evidence)/
OD-W3-3 still open as product/process decisions.
