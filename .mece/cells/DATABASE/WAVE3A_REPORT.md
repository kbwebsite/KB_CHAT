# WAVE 3A REPORT — FK/ONDELETE audit (2026-10-06 UTC, audit-only)

## 1. Executive summary

56 FKs inventoried fresh; **8 lack ondelete** (reconfirmed); every FK has an
explicit recommendation (5 CASCADE-equivalent incl. 2 DDL alignments, 4 SET
NULL, 0 RESTRICT, auth/session FKs verified correct as-is). No user-delete
path exists in the app, so all user-FK risk is latent (prod-Postgres-only:
SQLite doesn't enforce FKs at all — verified `PRAGMA foreign_keys=0`).
Largest real hazards: conversation-delete N+1 ORM cascade and future
account-deletion fan-out. Nothing was changed: no code, models, migrations,
or tests touched.

## 2. FK count

**56** `ForeignKey(` declarations across 21 model files; 48 with ondelete
(38 CASCADE, 10 SET NULL), **8 bare**. 8 ORM `delete-orphan` chains, 0
`passive_deletes`, 0 `ForeignKeyConstraint(`, 0 cycles.

## 3. Previously identified 8 — rechecked verdict

| FK | Old claim | Fresh verdict |
|---|---|---|
| `conversations.created_by` | dangling | SET NULL (nullable already; DDL-only) |
| `broadcast_lists.owner_id` | dangling | CASCADE (single-owner tool) |
| `communities.owner_id` | strands community | SET NULL + nullable (shared structure) |
| `channels.owner_id` | strands channel | SET NULL + nullable (shared structure) |
| `channel_posts.sender_id` | strands posts | SET NULL + nullable (precedent: messages) |
| `agent_conversations.user_id` | violation risk | CASCADE (private data) |
| `agent_messages.conversation_id` | app-only cascade | CASCADE (align DDL to ORM; test-proven) |
| `messages.reply_to_id` | dangling preview | SET NULL (nullable already; DDL-only) |

## 4. Full current inventory

See `WAVE3A_FK_INVENTORY.md` (56-row table + implicit relations + ORM
behavior + DDL inspector evidence).

## 5. Application deletion behavior

- Conversation/group delete (`conversations.py:540-591`): membership bulk
  delete + message soft-delete + manual poll ORM-deletes + `db.delete(conv)`
  (ORM cascade hard-deletes messages anyway). Events/scheduled/notif-links:
  DB-CASCADE on PG, orphans on SQLite.
- Channel/community delete: bulk link/post deletes first, then parent —
  SQLite-safe by construction.
- Member/leave paths delete membership rows only (correct; convs survive).
- **No user delete or deactivate endpoint exists** (verified by grep) —
  `is_active` is never written by any route.
- Deletion tests today: message delete, clear-chat, group leave/handoff,
  agent-conv delete. No cascade-behavior tests for conv/channel/community.

## 6. Recommended changes (Wave 3B scope)

DDL-only (PG ALTER, zero data risk): #4 `created_by`→SET NULL, #6
`reply_to_id`→SET NULL, #2 agent conv→CASCADE. Nullable+DDL: #3, #7, #8
(owner/sender →SET NULL) + #1, #5 (CASCADE, no null change). Plus
OD-W3-1 governance rule for ownerless community/channel (frozen interim OK).

## 7. Data-loss risks

- CASCADE on user delete (future endpoint) erases ~20 tables of user data in
  one transaction — intended for erasure, catastrophic if triggered by bug.
  Requires confirm-gate + tests at fan-out before any account-delete API.
- Conversation delete already hard-deletes soft-deleted messages via ORM
  cascade (double-work, same result — document, don't "fix" silently).
- Rollback after a CASCADE delete is backup-only; see §11.

## 8. Staging strategy

1. Snapshot: `pg_dump --schema-only` + row counts per table on a staging
   Postgres (prod-like version).
2. Representative data: anonymized prod copy OR generator (users × convs ×
   10k-msg group × polls/events/channels + orphan probes).
3. Orphan scan (must be zero pre-ALTER; queries per bare FK, e.g.
   `communities.owner_id NOT IN (SELECT id FROM users)` ×8).
4. Apply ALTERs (idempotent script, checkfirst on constraint names).
5. Integrity checks: re-run scans + inspector DDL diff + app boot.
6. Deletion tests (Wave 3B suite) against staging.
7. Rollback: DDL revert script ready (constraint swap back); data rollback =
   snapshot restore only.

## 9. Test strategy (Wave 3B suite design)

Per FK class, against **Postgres** (SQLite can't verify DDL behavior) with
citizenship in `tests/test_fk_*.py`: CASCADE (delete parent → dependents
gone, incl. nested chain conv→msg→reaction/attachment and user→statuses);
SET NULL (child survives, FK null; reply thread renders); ownerless display
paths; high-fan-out conv delete completes; association rows die with either
parent; user delete end-to-end (behind flag until endpoint exists);
SQLite-parity test asserting app-level outcomes identical on both DBs.

## 10. Migration strategy

Constraint found: **current tooling cannot ALTER FKs** (`create_tables` only
creates; `_ensure_missing_columns` only ADDs nullable columns). Do NOT
introduce Alembic for 8 constraint swaps — smallest safe mechanism: a
versioned, idempotent SQL script (`backend/app/database/fk_migrations/`,
`{seq}_{name}.sql` with up/down + `applied_migrations` ledger table),
executed at boot after `create_tables` (PG only; skipped on SQLite where
constraints are unenforced and new tables already carry correct DDL).
SQLite existing DBs: no action needed (behavioral no-op); devs may rebuild.

## 11. Rollback strategy

- DDL revert: down-scripts re-swap constraints (safe while no deletes ran).
- After production deletes: **irreversible without backup** — any user/conv
  CASCADE migration ships only with a fresh snapshot + restore runbook.
- SET NULL changes are data-preserving both directions (re-attach impossible
  post-hoc, but nothing is lost).

## 12. Open decisions

OD-W3-1 ownerless governance · OD-W3-2 staging sign-off · OD-W3-3
pseudo-relations (`member_ids`, `correct_option_id`) app-cleanup vs stale.
OD-5 (legacy auth cutoff) untouched by this wave.

## 13. Exact next implementation step (Wave 3B, NOT started)

1. Provision staging Postgres copy + run §8 orphan scans (expect zero).
2. Write `fk_migrations/01_user_fk_ondelete.sql` (DDL-only #1/#4/#5/#6 +
   agent #2) → test suite → deploy → verify.
3. Then `02_nullable_owner_sender.sql` (#3/#7/#8) with display/governance
   handling + OD-W3-1 rule. No app behavior changes beyond DDL.
