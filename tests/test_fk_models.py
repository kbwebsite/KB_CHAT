"""Wave 3B: FK declarations, orphan scans, and migration machinery.

SQLite-safe by design (PRAGMA foreign_keys=0 here, so these tests assert
metadata intent + data integrity, NOT DDL enforcement — that is
test_fk_postgres.py, PG-gated). No PG required, nothing destructive.
"""

import os
import sys

import pytest
from sqlalchemy import inspect

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database.connection import engine
from app.database.fk_migrations import (
    MIGRATIONS,
    ORPHAN_SCANS,
    SkippedMigration,
    _sha256_file,
    _split_sections,
    _statements,
    apply_migrations,
    run_orphan_scans,
)
from app.models.agent import AgentConversation, AgentMessage
from app.models.broadcast import BroadcastList
from app.models.conversation import Conversation
from app.models.message import Message

EXPECTED = {
    (AgentConversation.__table__, "user_id"): "CASCADE",
    (AgentMessage.__table__, "conversation_id"): "CASCADE",
    (BroadcastList.__table__, "owner_id"): "CASCADE",
    (Conversation.__table__, "created_by"): "SET NULL",
    (Message.__table__, "reply_to_id"): "SET NULL",
}


def _ondelete_of(table, column):
    for fk in table.foreign_keys:
        parents = [c.name for c in fk.constraint.columns]
        if column in parents:
            return (fk.ondelete or "").upper() or None
    return None


def test_model_declarations_carry_target_ondelete():
    for (table, column), want in EXPECTED.items():
        assert _ondelete_of(table, column) == want, f"{table.name}.{column}"


def test_setnull_targets_are_nullable():
    assert Conversation.__table__.c.created_by.nullable is True
    assert Message.__table__.c.reply_to_id.nullable is True


def test_orphan_scans_zero_on_local_db():
    with engine.begin() as conn:
        scans = run_orphan_scans(conn)
    assert len(scans) == len(ORPHAN_SCANS) == 5
    for label, count in scans.items():
        assert count == 0, f"{label} has {count} orphans"


def test_sqlite_does_not_enforce_fks_documented():
    # If this ever flips to 1, FK behavior below changes platform-wide and
    # the Wave 3B report's SQLite assumptions must be revisited deliberately.
    with engine.connect() as conn:
        pragma = conn.exec_driver_sql("PRAGMA foreign_keys").fetchone()[0]
    assert pragma == 0


def test_registry_and_files_coherent():
    assert len(MIGRATIONS) == 5
    base = os.path.join(
        os.path.dirname(__file__), "..", "backend", "app", "database", "fk_migrations"
    )
    ids = [m[0] for m in MIGRATIONS]
    assert ids == sorted(ids), "deterministic ordering"
    assert len(set(ids)) == 5, "unique IDs"
    for mid, _desc, filename, table, column, target, cname in MIGRATIONS:
        path = os.path.join(base, filename)
        assert os.path.isfile(path), filename
        sections = _split_sections(open(path, encoding="utf-8").read())
        assert "up" in sections and "down" in sections, filename
        assert _statements(sections["up"]), filename
        assert _statements(sections["down"]), filename
        assert cname in sections["up"] and cname in sections["down"], filename
        assert target in sections["up"], filename


def test_runner_refuses_non_postgres():
    with pytest.raises(SkippedMigration):
        apply_migrations(engine, sql_dir="irrelevant")
