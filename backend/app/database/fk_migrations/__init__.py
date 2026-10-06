"""Versioned FK-constraint migrations (Wave 3B).

Smallest safe mechanism for the 5 DDL-only FK swaps ( disperate from
``create_tables``, which can only CREATE, and ``_ensure_missing_columns``,
which can only ADD nullable columns — neither can ALTER a constraint).

Rules (see WAVE3A_REPORT §10):
- PostgreSQL ONLY. SQLite neither enforces FKs (PRAGMA foreign_keys=0) nor
  needs the change (new tables already carry correct DDL from models).
  On SQLite the runner logs and returns ``skipped`` — never pretends.
- NEVER runs at import or app boot. Execute explicitly via
  ``scripts/apply_fk_migrations.py`` (deploy pipeline / staging shell).
- One transaction per migration; ledger row commits WITH the DDL.
- Preconditions (orphan scan zero, current state != target) run first;
  any failure aborts that migration loudly — no partial application.
- Constraint names are discovered at runtime (SQLAlchemy never named them,
  so Postgres auto-names differ per database); new constraints get explicit
  stable names so down-migrations and re-runs are deterministic.
"""

import hashlib

from sqlalchemy import text

LEDGER_TABLE = "applied_fk_migrations"

# (migration_id, description, sql_filename, table, column, target_ondelete,
#  explicit constraint name used by up/down SQL).
MIGRATIONS = [
    (
        "01_agent_conversations_user_cascade",
        "agent_conversations.user_id -> users.id ON DELETE CASCADE",
        "01_agent_conversations_user_cascade.sql",
        "agent_conversations",
        "user_id",
        "CASCADE",
        "fk_agent_conversations_user_id",
    ),
    (
        "02_agent_messages_conversation_cascade",
        "agent_messages.conversation_id -> agent_conversations.id ON DELETE CASCADE",
        "02_agent_messages_conversation_cascade.sql",
        "agent_messages",
        "conversation_id",
        "CASCADE",
        "fk_agent_messages_conversation_id",
    ),
    (
        "03_broadcast_lists_owner_cascade",
        "broadcast_lists.owner_id -> users.id ON DELETE CASCADE",
        "03_broadcast_lists_owner_cascade.sql",
        "broadcast_lists",
        "owner_id",
        "CASCADE",
        "fk_broadcast_lists_owner_id",
    ),
    (
        "04_conversations_created_by_setnull",
        "conversations.created_by -> users.id ON DELETE SET NULL",
        "04_conversations_created_by_setnull.sql",
        "conversations",
        "created_by",
        "SET NULL",
        "fk_conversations_created_by",
    ),
    (
        "05_messages_reply_to_setnull",
        "messages.reply_to_id -> messages.id ON DELETE SET NULL",
        "05_messages_reply_to_setnull.sql",
        "messages",
        "reply_to_id",
        "SET NULL",
        "fk_messages_reply_to_id",
    ),
]

# Orphan scans: (label, sql). Must ALL return zero before the matching
# migration applies — ADD CONSTRAINT validates existing rows on Postgres,
# so any orphan fails the ALTER. Shared with tests (SQLite-safe SELECTs).
ORPHAN_SCANS = [
    (
        "agent_conversations.user_id",
        "SELECT COUNT(*) FROM agent_conversations WHERE user_id IS NOT NULL "
        "AND user_id NOT IN (SELECT id FROM users)",
    ),
    (
        "agent_messages.conversation_id",
        "SELECT COUNT(*) FROM agent_messages WHERE conversation_id IS NOT NULL "
        "AND conversation_id NOT IN (SELECT id FROM agent_conversations)",
    ),
    (
        "broadcast_lists.owner_id",
        "SELECT COUNT(*) FROM broadcast_lists WHERE owner_id IS NOT NULL "
        "AND owner_id NOT IN (SELECT id FROM users)",
    ),
    (
        "conversations.created_by",
        "SELECT COUNT(*) FROM conversations WHERE created_by IS NOT NULL "
        "AND created_by NOT IN (SELECT id FROM users)",
    ),
    (
        "messages.reply_to_id",
        "SELECT COUNT(*) FROM messages WHERE reply_to_id IS NOT NULL "
        "AND reply_to_id NOT IN (SELECT id FROM messages)",
    ),
]


class MigrationError(Exception):
    pass


class SkippedMigration(Exception):
    """Raised (not an error) when the dialect needs no work, e.g. SQLite."""


def _is_postgres(engine) -> bool:
    return engine.dialect.name == "postgresql"


def _sha256_file(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _split_sections(sql_text: str) -> dict:
    sections, current = {}, None
    for line in sql_text.splitlines():
        tag = line.strip().lower()
        if tag == "-- +up":
            current = "up"
            sections[current] = []
            continue
        if tag == "-- +down":
            current = "down"
            sections[current] = []
            continue
        if current is not None:
            sections[current].append(line)
    return {k: "\n".join(v) for k, v in sections.items()}


def _statements(section_sql: str) -> list:
    return [s.strip() for s in section_sql.split(";") if s.strip()]


def ensure_ledger(conn) -> None:
    conn.execute(
        text(
            f"CREATE TABLE IF NOT EXISTS {LEDGER_TABLE} "
            "(id TEXT PRIMARY KEY, checksum TEXT NOT NULL, "
            "applied_at TIMESTAMPTZ DEFAULT now())"
        )
    )


def applied_ids(conn) -> set:
    return {r[0] for r in conn.execute(text(f"SELECT id FROM {LEDGER_TABLE}"))}


def current_ondelete(conn, table: str, column: str):
    """On-delete action currently in DDL, or None if unconstrained/absent.

    Takes the live transaction connection (never a cached inspector) so
    pre/postconditions see uncommitted DDL inside the migration transaction.
    """
    from sqlalchemy import inspect as _inspect

    insp = _inspect(conn)
    if table not in insp.get_table_names():
        return None
    insp.clear_cache() if hasattr(insp, "clear_cache") else None
    for fk in insp.get_foreign_keys(table):
        if column in (fk.get("constrained_columns") or []):
            opts = fk.get("options") or {}
            return (opts.get("ondelete") or "").upper() or None
    return None


def find_fk_constraint_name(conn, table: str, column: str):
    """Postgres auto-names unnamed FK constraints; discover the live one."""
    row = conn.execute(
        text(
            "SELECT tc.constraint_name FROM information_schema.table_constraints tc "
            "JOIN information_schema.key_column_usage kcu "
            "ON tc.constraint_name = kcu.constraint_name "
            "AND tc.table_schema = kcu.table_schema "
            "WHERE tc.constraint_type = 'FOREIGN KEY' "
            "AND tc.table_name = :table AND kcu.column_name = :column"
        ),
        {"table": table, "column": column},
    ).fetchone()
    return row[0] if row else None


def run_orphan_scans(conn) -> dict:
    """Returns {label: count}. Pure SELECTs — safe on any database."""
    return {label: conn.execute(text(sql)).scalar() or 0 for label, sql in ORPHAN_SCANS}


def apply_migrations(engine, sql_dir: str, direction: str = "up") -> dict:
    """Apply (or roll back) FK migrations. Returns a per-migration report.

    Raises MigrationError on any unexpected state; raises SkippedMigration
    on non-Postgres dialects (nothing to enforce there).
    """
    import os

    if not _is_postgres(engine):
        raise SkippedMigration(
            f"dialect '{engine.dialect.name}' does not enforce FK constraints; "
            "nothing to migrate (new tables already carry correct DDL)"
        )
    if direction not in ("up", "down"):
        raise MigrationError(f"unknown direction: {direction}")
    report = {}
    with engine.begin() as conn:
        ensure_ledger(conn)
        done = applied_ids(conn)
        ordered = MIGRATIONS if direction == "up" else list(reversed(MIGRATIONS))
        for mid, _desc, filename, table, column, target, _cname in ordered:
            path = os.path.join(sql_dir, filename)
            checksum = _sha256_file(path)
            sections = _split_sections(open(path, encoding="utf-8").read())
            if direction == "up":
                if mid in done:
                    report[mid] = "already-applied"
                    continue
                state = current_ondelete(conn, table, column)
                if state == target:
                    # Fresh database created from new models: DDL already
                    # correct, just record it (convergent, not silent).
                    conn.execute(
                        text(
                            f"INSERT INTO {LEDGER_TABLE} (id, checksum) "
                            "VALUES (:id, :checksum)"
                        ),
                        {"id": mid, "checksum": checksum},
                    )
                    report[mid] = "already-converged"
                    continue
                if state is None:
                    raise MigrationError(
                        f"{mid}: expected an existing FK on "
                        f"{table}.{column} to replace; schema differs"
                    )
                for label, count in run_orphan_scans(conn).items():
                    if count:
                        raise MigrationError(
                            f"{mid}: orphan scan failed: {label} has {count} "
                            "orphan rows; refusing to ALTER (see WAVE3A report)"
                        )
                old_name = find_fk_constraint_name(conn, table, column)
                if old_name is None:
                    raise MigrationError(
                        f"{mid}: constraint name for {table}.{column} "
                        "not discoverable; refusing to guess"
                    )
                conn.execute(
                    text(f'ALTER TABLE "{table}" DROP CONSTRAINT "{old_name}"')
                )
                for stmt in _statements(sections["up"]):
                    conn.execute(text(stmt))
                if current_ondelete(conn, table, column) != target:
                    raise MigrationError(
                        f"{mid}: postcondition failed on {table}.{column}"
                    )
                conn.execute(
                    text(
                        f"INSERT INTO {LEDGER_TABLE} (id, checksum) "
                        "VALUES (:id, :checksum)"
                    ),
                    {"id": mid, "checksum": checksum},
                )
                report[mid] = "applied"
            else:
                if mid not in done:
                    report[mid] = "not-applied"
                    continue
                for stmt in _statements(sections["down"]):
                    conn.execute(text(stmt))
                if current_ondelete(conn, table, column) == target:
                    raise MigrationError(
                        f"{mid}: rollback postcondition failed on {table}.{column}"
                    )
                conn.execute(
                    text(f"DELETE FROM {LEDGER_TABLE} WHERE id = :id"), {"id": mid}
                )
                report[mid] = "rolled-back"
    return report
