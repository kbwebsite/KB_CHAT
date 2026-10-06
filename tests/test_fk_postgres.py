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


@pytest.fixture()
def pg():
    from sqlalchemy import create_engine
    from app.database.connection import Base

    engine = create_engine(TEST_PG_URL)
    # Isolated schema per run: create all, yield, drop all.
    Base.metadata.create_all(engine)
    from sqlalchemy.orm import Session

    db = Session(bind=engine)
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


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
    pg.delete(u)
    pg.commit()
    assert pg.query(AgentConversation).filter_by(user_id=u.id).count() == 0
    assert pg.query(AgentMessage).filter_by(conversation_id=conv.id).count() == 0


@needs_pg
def test_user_delete_cascades_broadcast_lists(pg):
    from app.models.broadcast import BroadcastList

    u = _user(pg, "b1")
    pg.add(BroadcastList(owner_id=u.id, name="L", member_ids=[]))
    pg.commit()
    pg.delete(u)
    pg.commit()
    assert pg.query(BroadcastList).filter_by(owner_id=u.id).count() == 0


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
    pg.delete(u)
    pg.commit()
    assert pg.query(AgentConversation).filter_by(user_id=u.id).count() == 0
    assert pg.query(BroadcastList).filter_by(owner_id=u.id).count() == 0
