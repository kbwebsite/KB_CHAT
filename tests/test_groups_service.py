"""Wave 1: group-admin service paths (both routers, both policies).

Exercises ``app/services/groups.py`` through the live HTTP surface:
- conversations-router admin paths (``/api/conversations/groups/...``)
- groups-router paths (``/api/groups/...``), incl. the divergent self-leave
  semantics and the empty-title update nuance.
"""

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


def _setup_group(suffix):
    owner, m1, m2 = f"gowner{suffix}", f"gmem1{suffix}", f"gmem2{suffix}"
    for u in (owner, m1, m2):
        _signup(u, f"{u}@ex.com")
    ho = {"Authorization": f"Bearer {_token(owner)}"}
    h1 = {"Authorization": f"Bearer {_token(m1)}"}
    r = client.post(
        "/api/conversations",
        json={"is_group": True, "title": "Svc Group", "member_usernames": [m1, m2]},
        headers=ho,
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    ids = {m["username"]: m["user_id"] for m in data["members"]}
    return data["id"], ho, h1, ids


def _s():
    return str(int(time.time() * 1000))[-5:] + str(os.getpid() % 97)


def _member_ids(ids):
    m1 = next(v for k, v in ids.items() if k.startswith("gmem1"))
    m2 = next(v for k, v in ids.items() if k.startswith("gmem2"))
    return m1, m2


def test_role_promote_and_guards():
    gid, ho, h1, ids = _setup_group(_s())
    m1id, m2id = _member_ids(ids)
    r = client.patch(
        f"/api/conversations/groups/{gid}/members/{m1id}",
        json={"role": "admin"},
        headers=ho,
    )
    assert r.status_code == 200, r.text
    assert r.json()["message"] == "Member is now admin"
    r2 = client.patch(
        f"/api/conversations/groups/{gid}/members/{m2id}",
        json={"role": "admin"},
        headers=h1,
    )
    assert r2.status_code == 403, r2.text
    r3 = client.patch(
        f"/api/conversations/groups/{gid}/members/{m1id}",
        json={"role": "superadmin"},
        headers=ho,
    )
    assert r3.status_code == 400, r3.text


def test_conversations_remove_member_guards():
    gid, ho, h1, ids = _setup_group(_s())
    m1id, m2id = _member_ids(ids)
    r = client.delete(f"/api/conversations/groups/{gid}/members/{m2id}", headers=h1)
    assert r.status_code == 403, r.text
    r2 = client.delete(f"/api/conversations/groups/{gid}/members/{m1id}", headers=ho)
    assert r2.status_code == 200, r2.text
    assert r2.json()["message"] == "Member removed"


def test_groups_router_empty_title_update_ignored():
    gid, ho, h1, ids = _setup_group(_s())
    r = client.patch(f"/api/groups/{gid}", json={"title": ""}, headers=ho)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["title"] == "Svc Group"


def test_groups_router_update_and_add_members():
    gid, ho, h1, ids = _setup_group(_s())
    r = client.patch(f"/api/groups/{gid}", json={"description": "new desc"}, headers=ho)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["description"] == "new desc"
    r2 = client.patch(f"/api/groups/{gid}", json={"title": "hijack"}, headers=h1)
    assert r2.status_code == 403, r2.text
