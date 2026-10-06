# WAVE 3B — Implementation (what was built)

## Scope actually implemented (5 DDL-only FKs; governance trio excluded)

| # | Change (models/) | File:line |
|---|---|---|
| 1 | `agent_conversations.user_id` → `ondelete="CASCADE"` | `models/agent.py:11` |
| 2 | `agent_messages.conversation_id` → `ondelete="CASCADE"` | `models/agent.py:29` |
| 3 | `broadcast_lists.owner_id` → `ondelete="CASCADE"` | `models/broadcast.py:17` |
| 4 | `conversations.created_by` → `ondelete="SET NULL"` (already nullable) | `models/conversation.py:25` |
| 5 | `messages.reply_to_id` → `ondelete="SET NULL"` (already nullable) | `models/message.py:45` |

SET NULL nullability verified pre-change (hard-stop condition passed);
CASCADE paths verified acyclic (WAVE3A_FK_GRAPH). NOT touched:
`communities.owner_id`, `channels.owner_id`, `channel_posts.sender_id`
(OD-W3-1), all 48 good FKs, all relationships, `passive_deletes` (still zero).

## Migration mechanism (new, PG-only, never at boot)

- `backend/app/database/fk_migrations/__init__.py` — registry (id, desc,
  file, table, column, target, explicit name), ledger table
  `applied_fk_migrations`, orphan-scan registry (5 SELECTs), runner
  `apply_migrations(engine, sql_dir, direction)`.
- 5 SQL files with `-- +up` / `-- +down` sections; up adds the explicit
  constraint, down drops it and re-adds the bare original.
- Runtime discovery of Postgres auto-named constraints (never guessed);
  per-migration transaction; preconditions (table/FK present, orphan scans
  zero, state != target — with `already-converged` fast path for fresh DBs);
  postconditions (inspector re-check inside the txn); checksum recorded.
- `scripts/apply_fk_migrations.py` — explicit CLI (`--direction`,
  `--scan-only`, `--database-url`); exit 0/2/3. NOT wired into boot.
- SQLite: runner raises `SkippedMigration` (verified); new tables already
  carry correct DDL from models, and constraints are unenforced there.

## ORM alignment

No relationship changes needed: existing `delete-orphan` chains
(agent conv→messages) already match CASCADE; bare-FK parents had no ORM
relationships to conflict. DB is source of truth; models now declare it.

## Rollback (per migration)

Down SQL restores the exact bare constraint. DDL revert safe any time
pre-delete. Post-delete data recovery is backup-only (CASCADE) — SET NULL
loses nothing. Full procedure + warnings in WAVE3B_MIGRATION.md.
