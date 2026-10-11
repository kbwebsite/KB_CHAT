"""Community announcement thread: fan-out collapses into one WhatsApp-style thread."""

import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.main import app
from app.database.connection import SessionLocal, create_tables
from app.models.user import User
from app.models.verification import VerificationCode

create_tables()
client = TestClient(app)


def _signup(username, email):
    r = client.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": username,
            "password": "password123",
            "confirm_password": "password123",
        },
    )
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        db.query(User).filter_by(email=email.lower()).first().email_verified = True
        db.commit()
    finally:
        db.close()


def _token(username):
    r = client.post(
        "/api/auth/login", json={"identifier": username, "password": "password123"}
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    if "access_token" in data:
        return data["access_token"]
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
    r2 = client.post("/api/auth/verify-login", json={"email": email, "code": "123456"})
    return r2.json()["data"]["access_token"]


def _s():
    return str(int(time.time() * 1000))[-5:] + str(os.getpid() % 97)


def _setup(suffix):
    """Owner + member + outsider, two groups, one community with both linked."""
    owner, mem, out = f"cown{suffix}", f"cmem{suffix}", f"cout{suffix}"
    for u in (owner, mem, out):
        _signup(u, f"{u}@ex.com")
    ho = {"Authorization": f"Bearer {_token(owner)}"}
    hm = {"Authorization": f"Bearer {_token(mem)}"}
    hx = {"Authorization": f"Bearer {_token(out)}"}
    gids = []
    for title in ("G1", "G2"):
        r = client.post(
            "/api/conversations",
            json={"is_group": True, "title": title, "member_usernames": [mem]},
            headers=ho,
        )
        assert r.status_code == 200, r.text
        gids.append(r.json()["data"]["id"])
    r = client.post(
        "/api/communities", json={"name": "Club", "description": "d"}, headers=ho
    )
    assert r.status_code == 200, r.text
    cid = r.json()["data"]["id"]
    for gid in gids:
        r = client.post(
            f"/api/communities/{cid}/groups",
            json={"conversation_id": gid},
            headers=ho,
        )
        assert r.status_code == 200, r.text
    return cid, gids, ho, hm, hx


def test_announce_fans_out_and_thread_dedupes():
    cid, gids, ho, hm, hx = _setup(_s())
    r = client.post(
        f"/api/communities/{cid}/announce", json={"content": "Hello all"}, headers=ho
    )
    assert r.status_code == 200, r.text
    assert sorted(r.json()["data"]["reached"]) == sorted(gids)

    # One thread item (not one per group), prefix stripped, groups noted.
    r = client.get(f"/api/communities/{cid}/announcements", headers=ho)
    assert r.status_code == 200, r.text
    thread = r.json()["data"]
    assert len(thread) == 1, thread
    item = thread[0]
    assert item["text"] == "Hello all"
    assert "📢" not in item["text"]
    assert sorted(item["groups"]) == ["G1", "G2"]
    assert item["sender_username"] is not None

    # Member (non-owner) can read the same thread.
    r = client.get(f"/api/communities/{cid}/announcements", headers=hm)
    assert r.status_code == 200, r.text
    assert len(r.json()["data"]) == 1

    # Second announcement lands newest-last.
    r = client.post(
        f"/api/communities/{cid}/announce", json={"content": "Second"}, headers=ho
    )
    assert r.status_code == 200, r.text
    thread = client.get(f"/api/communities/{cid}/announcements", headers=ho).json()[
        "data"
    ]
    assert [t["text"] for t in thread] == ["Hello all", "Second"]


def test_announcement_guards():
    cid, gids, ho, hm, hx = _setup(_s())
    # Outsider cannot read.
    r = client.get(f"/api/communities/{cid}/announcements", headers=hx)
    assert r.status_code == 403, r.text
    # Member cannot announce.
    r = client.post(
        f"/api/communities/{cid}/announce", json={"content": "hi"}, headers=hm
    )
    assert r.status_code == 403, r.text
    # Empty community reads as an empty thread, not an error.
    r = client.post("/api/communities", json={"name": "Empty"}, headers=ho)
    assert r.status_code == 200, r.text
    empty = r.json()["data"]["id"]
    r = client.get(f"/api/communities/{empty}/announcements", headers=ho)
    assert r.status_code == 200, r.text
    assert r.json()["data"] == []
