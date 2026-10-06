"""Wave 3B: Postgres-backed FK enforcement tests (STAGING-GATED).

These tests REQUIRE a real PostgreSQL server — SQLite (PRAGMA
foreign_keys=0) cannot verify DDL enforcement, and this file refuses to
pretend otherwise: every test skips unless a PG server answers at
TEST_PG_URL (env) or localhost:5432. Run on staging with a representative
dataset before prod ALTERs.

Covers brief Phase 5 A–E: CASCADE chains, SET NULL survival, nested
dependencies, invalid-reference rejection, orphan-free deletes.
"""

import os
import socket
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

TEST_PG_URL = os.environ.get(
    "TEST_PG_URL", "postgresql://kbchat:kbchatpass@localhost:5432/kbchat"
)


def _pg_available() -> bool:
    try:
        from urllib.parse import urlparse

        parts = urlparse(TEST_PG_URL)
        socket.create_connection(
            (parts.hostname or "localhost", parts.port or 5432), timeout=2
        ).close()
        return True
    except Exception:
        return False


needs_pg = pytest.mark.skipif(
    not _pg_available(), reason="no PostgreSQL server (staging-gated)"
)


@pytest.fixture(scope="module")
def pg():
    """Isolated PG database traveling the real prod path.

    create_all (new-model DDL) → strip 5 constraints to bare (simulates
    prod pre-migration DDL) → apply_migrations(up) via the real runner →
    behavior tests → drop database. Proves mechanism + behavior together.
    """
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session

    base = TEST_PG_URL.rsplit("/", 1)[0]
    admin = create_engine(base + "/postgres", isolation_level="AUTOCOMMIT")
    dbname = "kbchat_fktest"
    with admin.connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS "{dbname}"'))
        c.execute(text(f'CREATE DATABASE "{dbname}"'))
    admin.dispose()
    url = base + "/" + dbname
    engine = create_engine(url)
    try:
        import app.main  # noqa: full table registration (not just models/__init__)
        from app.database.connection import Base

        Base.metadata.create_all(engine)
        strips = [
            ("agent_conversations", "user_id", "users", "id"),
            ("agent_messages", "conversation_id", "agent_conversations", "id"),
            ("broadcast_lists", "owner_id", "users", "id"),
            ("conversations", "created_by", "users", "id"),
            ("messages", "reply_to_id", "messages", "id"),
        ]
        with engine.begin() as conn:
            for table, col, reftable, refcol in strips:
                names = conn.execute(
                    text(
                        "SELECT tc.constraint_name FROM information_schema.table_constraints tc "
                        "JOIN information_schema.key_column_usage kcu "
                        "ON tc.constraint_name = kcu.constraint_name "
                        "AND tc.table_schema = kcu.table_schema "
                        "WHERE tc.constraint_type = 'FOREIGN KEY' "
                        "AND tc.table_name = :t AND kcu.column_name = :c"
                    ),
                    {"t": table, "c": col},
                ).fetchall()
                for (cname,) in names:
                    conn.execute(
                        text(f'ALTER TABLE "{table}" DROP CONSTRAINT "{cname}"')
                    )
                conn.execute(
                    text(
                        f'ALTER TABLE "{table}" ADD FOREIGN KEY ("{col}") '
                        f'REFERENCES "{reftable}" ("{refcol}")'
                    )
                )
        import os as _os
        from app.database import fk_migrations as _fkm

        sql_dir = _os.path.join(
            _os.path.dirname(__file__),
            "..",
            "backend",
            "app",
            "database",
            "fk_migrations",
        )
        report = _fkm.apply_migrations(engine, sql_dir, direction="up")
        assert all(v == "applied" for v in report.values()), report
        db = Session(bind=engine)
        yield db
        db.close()
    finally:
        engine.dispose()
        admin2 = create_engine(base, isolation_level="AUTOCOMMIT")
        with admin2.connect() as c:
            c.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    f"WHERE datname = '{dbname}' AND pid <> pg_backend_pid()"
                )
            )
            c.execute(text(f'DROP DATABASE IF EXISTS "{dbname}"'))
        admin2.dispose()


def _user(db, suffix, **kw):
    from app.models.user import User
    from app.auth.security import hash_password

    u = User(
        username=f"pgu{suffix}",
        email=f"pgu{suffix}@ex.com",
        display_name="PG",
        hashed_password=hash_password("password123"),
        email_verified=True,
        **kw,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@needs_pg
def test_user_delete_cascades_agent_chain(pg):
    from app.models.agent import AgentConversation, AgentMessage

    u = _user(pg, "a1")
    conv = AgentConversation(user_id=u.id, title="t")
    pg.add(conv)
    pg.commit()
    pg.refresh(conv)
    pg.add(AgentMessage(conversation_id=conv.id, role="user", content="hi"))
    pg.commit()
    # Capture ids first: DB-level cascades delete rows behind the ORM
    # session's back, so touching mapped objects afterwards expires.
    uid, cid = u.id, conv.id
    pg.delete(u)
    pg.commit()
    pg.expunge_all()
    assert pg.query(AgentConversation).filter_by(user_id=uid).count() == 0
    assert pg.query(AgentMessage).filter_by(conversation_id=cid).count() == 0


@needs_pg
def test_user_delete_cascades_broadcast_lists(pg):
    from app.models.broadcast import BroadcastList

    u = _user(pg, "b1")
    pg.add(BroadcastList(owner_id=u.id, name="L", member_ids=[]))
    pg.commit()
    uid = u.id
    pg.delete(u)
    pg.commit()
    pg.expunge_all()
    assert pg.query(BroadcastList).filter_by(owner_id=uid).count() == 0


@needs_pg
def test_created_by_set_null_on_user_delete(pg):
    from app.models.conversation import Conversation, ConversationMember

    u = _user(pg, "c1")
    from app.models.conversation import Conversation as Conv

    conv = Conv(is_group=True, title="g", created_by=u.id)
    pg.add(conv)
    pg.commit()
    pg.refresh(conv)
    cid = conv.id
    pg.delete(u)
    pg.commit()
    row = pg.query(Conv).filter_by(id=cid).one()
    assert row.created_by is None


@needs_pg
def test_reply_survives_parent_delete(pg):
    from app.models.conversation import Conversation as Conv, ConversationMember
    from app.models.message import Message

    u = _user(pg, "r1")
    conv = Conv(is_group=False, created_by=u.id)
    pg.add(conv)
    pg.flush()
    pg.add(ConversationMember(conversation_id=conv.id, user_id=u.id, role="member"))
    parent = Message(conversation_id=conv.id, sender_id=u.id, content="p")
    pg.add(parent)
    pg.flush()
    child = Message(
        conversation_id=conv.id, sender_id=u.id, content="c", reply_to_id=parent.id
    )
    pg.add(child)
    pg.commit()
    child_id, parent_id = child.id, parent.id
    pg.delete(parent)
    pg.commit()
    row = pg.query(Message).filter_by(id=child_id).one()
    assert row.reply_to_id is None
    assert row.content == "c"


@needs_pg
def test_invalid_reference_rejected(pg):
    from app.models.agent import AgentConversation
    from sqlalchemy.exc import IntegrityError

    pg.add(AgentConversation(user_id=999999999, title="ghost"))
    with pytest.raises(IntegrityError):
        pg.commit()
    pg.rollback()


@needs_pg
def test_no_orphans_after_supported_deletes(pg):
    from app.models.agent import AgentConversation
    from app.models.broadcast import BroadcastList

    u = _user(pg, "z1")
    pg.add(AgentConversation(user_id=u.id, title="t"))
    pg.add(BroadcastList(owner_id=u.id, name="L", member_ids=[]))
    pg.commit()
    uid = u.id
    pg.delete(u)
    pg.commit()
    pg.expunge_all()
    assert pg.query(AgentConversation).filter_by(user_id=uid).count() == 0
    assert pg.query(BroadcastList).filter_by(owner_id=uid).count() == 0
