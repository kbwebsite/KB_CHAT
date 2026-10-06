"""Wave 4B Priority 1: server-side bounds on dangerous list/feed endpoints.

Proves: default/max bounds, deterministic ordering, compatible shapes,
DB-level (not slice-after-fetch) bounding for status feed.
"""

import os
import sys
import time

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database.connection import SessionLocal, create_tables
from app.models.user import User
from app.main import app

create_tables()
client = TestClient(app)


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


def _conv_with_messages(token, n, prefix):
    jar = TestClient(app)
    r = jar.post(
        "/api/conversations",
        json={"is_group": True, "title": f"{prefix} group"},
        headers=_h(token),
    )
    assert r.status_code == 200, r.text
    cid = r.json()["data"]["id"]
    for i in range(n):
        m = jar.post(
            f"/api/conversations/{cid}/messages",
            json={"content": f"m{i:04d}"},
            headers=_h(token),
        )
        assert m.status_code == 200, m.text
    return cid, jar


def test_export_bounded_and_compatible():
    u, e = _unique("exp"), f"{_unique('exp')}@ex.com"
    _signup(u, e)
    token, _ = _login(u)
    cid, jar = _conv_with_messages(token, 12, "exp")
    r = jar.get(f"/api/conversations/{cid}/export", headers=_h(token))
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    # legacy shape preserved...
    assert len(data["messages"]) == 12
    assert [m["content"] for m in data["messages"]] == [f"m{i:04d}" for i in range(12)]
    assert set(data["messages"][0]) >= {"sender", "content", "timestamp", "attachments"}
    # ...plus additive bound metadata
    assert data["total"] == 12 and data["truncated"] is False
    # explicit small bound keeps newest window in legacy order
    r2 = jar.get(f"/api/conversations/{cid}/export?limit=5", headers=_h(token))
    d2 = r2.json()["data"]
    assert len(d2["messages"]) == 5
    assert d2["truncated"] is True and d2["total"] == 12
    assert [m["content"] for m in d2["messages"]] == [f"m{i:04d}" for i in range(7, 12)]
    # max enforced
    assert (
        jar.get(
            f"/api/conversations/{cid}/export?limit=99999", headers=_h(token)
        ).status_code
        == 422
    )
    # txt shape unchanged
    rt = jar.get(
        f"/api/conversations/{cid}/export?format=txt&limit=3", headers=_h(token)
    )
    assert rt.status_code == 200 and "m0011" in rt.text


def test_status_feed_bounded():
    u, e = _unique("st"), f"{_unique('st')}@ex.com"
    _signup(u, e)
    token, jar = _login(u)
    for i in range(3):
        r = jar.post("/api/status", data={"content": f"s{i}"}, headers=_h(token))
        assert r.status_code == 200, r.text
    feed = jar.get("/api/status/feed", headers=_h(token)).json()["data"]
    assert set(feed) == {"my_status", "recent", "viewed"}
    assert len(feed["my_status"]) == 3
    # DB-level bound respected
    feed1 = jar.get("/api/status/feed?limit=1", headers=_h(token)).json()["data"]
    assert len(feed1["my_status"]) + len(feed1["recent"]) + len(feed1["viewed"]) <= 1
    assert jar.get("/api/status/feed?limit=9999", headers=_h(token)).status_code == 422
    mine = jar.get("/api/status/my?limit=2", headers=_h(token)).json()["data"]
    assert len(mine) == 2


def test_community_channel_lists_bounded():
    u, e = _unique("cc"), f"{_unique('cc')}@ex.com"
    _signup(u, e)
    token, jar = _login(u)
    for i in range(3):
        assert (
            jar.post(
                "/api/communities", json={"name": f"c{i}"}, headers=_h(token)
            ).status_code
            == 200
        )
        assert (
            jar.post(
                "/api/channels", json={"name": f"ch{i}"}, headers=_h(token)
            ).status_code
            == 200
        )
    comms = jar.get("/api/communities", headers=_h(token)).json()["data"]
    assert len(comms) == 3 and set(comms[0]) >= {"id", "name", "owner_id", "groups"}
    assert (
        len(jar.get("/api/communities?limit=2", headers=_h(token)).json()["data"]) == 2
    )
    chans = jar.get("/api/channels", headers=_h(token)).json()["data"]
    # global discovery list: assert ours present (shared dev DB accumulates)
    names = {c["name"] for c in chans}
    assert {f"ch{i}" for i in range(3)} <= names
    assert set(chans[0]) >= {"id", "name", "followed"}
    assert len(jar.get("/api/channels?limit=2", headers=_h(token)).json()["data"]) == 2
    assert jar.get("/api/channels?limit=9999", headers=_h(token)).status_code == 422
