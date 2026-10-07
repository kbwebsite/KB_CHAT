"""Wave 4D: batching equivalence + bounded query counts.

Proves the Wave 4D rewrites return identical shapes/values with flat
query counts. Counts measured on the app engine via event listener
(statement shapes are dialect-independent for these ORM paths).
"""

import os
import sys
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database.connection import SessionLocal, create_tables, engine
from app.models.user import User
from app.main import app
from app.utils import privacy as privacy_mod

create_tables()
client = TestClient(app)


class Counter:
    def __init__(self):
        self.n = 0

    def __enter__(self):
        def _b(conn, cursor, statement, params, ctx, xm):
            self.n += 1

        self._b = _b
        event.listen(engine, "before_cursor_execute", self._b)
        return self

    def __exit__(self, *a):
        event.remove(engine, "before_cursor_execute", self._b)


def _unique(prefix):
    return f"{prefix}{str(int(time.time() * 1000))[-6:]}{os.getpid() % 1000}"


def _signup(username, email, password="password123"):
    r = client.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": username,
            "password": password,
            "confirm_password": password,
        },
    )
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        db.query(User).filter_by(email=email.lower()).first().email_verified = True
        db.commit()
    finally:
        db.close()


def _login(username, password="password123"):
    import hashlib
    from datetime import datetime, timedelta, timezone

    from app.models.verification import VerificationCode

    jar = TestClient(app)
    r = jar.post("/api/auth/login", json={"identifier": username, "password": password})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    if "access_token" not in data:
        email = data["email"]
        db = SessionLocal()
        try:
            user = db.query(User).filter_by(email=email).first()
            db.query(VerificationCode).filter_by(
                code_hash=hashlib.sha256(b"123456").hexdigest()
            ).delete()
            db.add(
                VerificationCode(
                    user_id=user.id,
                    email=email,
                    code_hash=hashlib.sha256(b"123456").hexdigest(),
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
                )
            )
            db.commit()
        finally:
            db.close()
        r = jar.post("/api/auth/verify-login", json={"email": email, "code": "123456"})
        data = r.json()["data"]
    return data["access_token"], jar


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_presence_batch_matches_single_all_scopes():
    from app.models.settings import UserSettings

    db = SessionLocal()
    try:
        a = _unique("pa")
        b = _unique("pb")
        _signup(a, f"{a}@ex.com")
        _signup(b, f"{b}@ex.com")
        au = db.query(User).filter_by(username=a).one()
        bu = db.query(User).filter_by(username=b).one()
        au.is_online = True
        db.commit()
        auid, buid = au.id, bu.id
        for scope in ("everyone", "contacts", "nobody", None):
            s = db.query(UserSettings).filter_by(user_id=auid).first()
            if s is None:
                s = UserSettings(user_id=auid)
                db.add(s)
            s.online_status_visible = scope
            s.last_seen_visible = scope
            db.commit()
            # contact (shared conv) vs stranger
            for mk_contact in (False, True):
                if mk_contact:
                    from app.models.conversation import Conversation, ConversationMember

                    c = Conversation(is_group=False, created_by=auid)
                    db.add(c)
                    db.flush()
                    db.add(
                        ConversationMember(
                            conversation_id=c.id, user_id=auid, role="member"
                        )
                    )
                    db.add(
                        ConversationMember(
                            conversation_id=c.id, user_id=buid, role="member"
                        )
                    )
                    db.commit()
                db.expunge_all()
                tgt = db.query(User).filter_by(id=auid).one()
                single = privacy_mod.presence_for_viewer(db, viewer_id=buid, target=tgt)
                batched = privacy_mod.presence_for_viewers(
                    db, viewer_id=buid, targets=[tgt]
                )
                assert batched[tgt.id] == single, (scope, mk_contact)
                assert set(single) == {"is_online", "last_seen"}
    finally:
        db.close()


def test_status_feed_batched_queries_and_shapes():
    u, e = _unique("sb"), f"{_unique('sb')}@ex.com"
    v, ve = _unique("sbv"), f"{_unique('sbv')}@ex.com"
    _signup(u, e)
    _signup(v, ve)
    atoken, ajar = _login(u)
    vtoken, vjar = _login(v)
    # statuses default to contacts-visibility: share a conversation first
    assert (
        ajar.post(
            "/api/conversations", json={"participant_username": v}, headers=_h(atoken)
        ).status_code
        == 200
    )
    for i in range(5):
        r = ajar.post("/api/status", data={"content": f"hello {i}"}, headers=_h(atoken))
        assert r.status_code == 200, r.text
    # viewer reads one (viewed flag + view_count paths)
    mine = vjar.get("/api/status/my", headers=_h(vtoken)).json()["data"]
    assert mine == []
    feed_v = vjar.get("/api/status/feed", headers=_h(vtoken)).json()["data"]
    assert len(feed_v["recent"]) + len(feed_v["viewed"]) >= 1
    first = (feed_v["recent"] or feed_v["viewed"])[0]
    sid = first["id"]
    assert vjar.post(f"/api/status/{sid}/view", headers=_h(vtoken)).status_code == 200
    with Counter() as c:
        feed = vjar.get("/api/status/feed", headers=_h(vtoken))
    assert feed.status_code == 200
    data = feed.json()["data"]
    assert set(data) == {"my_status", "recent", "viewed"}
    assert c.n <= 12, f"feed issued {c.n} queries (N+1 back?)"
    # viewed flag + count + shape preserved
    seen = [s for s in data["recent"] + data["viewed"] if s["id"] == sid][0]
    assert seen["viewed"] is True and seen["view_count"] >= 1
    assert set(seen) >= {
        "id",
        "username",
        "display_name",
        "content",
        "viewed",
        "view_count",
        "viewers",
        "is_own",
        "privacy",
    }
    # /my with viewers list populated
    with Counter() as c2:
        my = ajar.get("/api/status/my", headers=_h(atoken)).json()["data"]
    assert len(my) == 5
    assert c2.n <= 10, f"/my issued {c2.n} queries"
    assert all(isinstance(s["viewers"], list) for s in my)
    assert my[0]["viewers"][0]["viewer_id"] is not None


def test_search_eager_and_bounded():
    u, e = _unique("se"), f"{_unique('se')}@ex.com"
    _signup(u, e)
    token, jar = _login(u)
    r = jar.post(
        "/api/conversations", json={"is_group": True, "title": "seg"}, headers=_h(token)
    )
    cid = r.json()["data"]["id"]
    for i in range(6):
        assert (
            jar.post(
                f"/api/conversations/{cid}/messages",
                json={"content": f"needle-{i}"},
                headers=_h(token),
            ).status_code
            == 200
        )
    m0 = jar.get(f"/api/conversations/{cid}/messages", headers=_h(token)).json()[
        "data"
    ]["messages"][0]
    assert (
        jar.post(
            f"/api/messages/{m0['id']}/reactions",
            json={"emoji": "👍"},
            headers=_h(token),
        ).status_code
        == 200
    )
    with Counter() as c:
        res = jar.get("/api/messages/search?q=needle", headers=_h(token))
    assert res.status_code == 200
    hits = res.json()["data"]
    assert len(hits) == 6
    assert c.n <= 10, f"search issued {c.n} queries (N+1 back?)"
    reacted = [h for h in hits if h["reactions"]]
    assert reacted and reacted[0]["reactions"][0]["emoji"] == "👍"
    assert set(hits[0]) >= {
        "id",
        "content",
        "sender_username",
        "attachments",
        "reactions",
    }


def test_users_search_batched_queries():
    u, e = _unique("us"), f"{_unique('us')}@ex.com"
    _signup(u, e)
    for i in range(5):
        n = f"{u}x{i}"
        _signup(n, f"{n}@ex.com")
    token, jar = _login(u)
    with Counter() as c:
        res = jar.get(f"/api/users/search?q={u}x", headers=_h(token))
    assert res.status_code == 200
    assert len(res.json()["data"]) == 5
    assert c.n <= 8, f"user search issued {c.n} queries (presence N+1 back?)"
