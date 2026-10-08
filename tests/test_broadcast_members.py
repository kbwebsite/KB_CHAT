"""PE-2G broadcast membership: isolated tests (unique users per run, own
lists only — no global counts asserted, so shared-DB accumulation cannot
affect them)."""

import hashlib
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.main import app
from app.database.connection import SessionLocal, create_tables
from app.models.user import User
from app.models.verification import VerificationCode

create_tables()
client = TestClient(app)


def _tag():
    return uuid.uuid4().hex[:10]


def _mark_verified(email):
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(email=email.lower()).first()
        if u is not None and not u.email_verified:
            u.email_verified = True
            db.commit()
    finally:
        db.close()


def make_user():
    t = _tag()
    u, e = f"bm{t}", f"bm{t}@ex.com"
    r = client.post(
        "/api/auth/signup",
        json={
            "username": u,
            "email": e,
            "display_name": f"BM {t}",
            "password": "password123",
            "confirm_password": "password123",
        },
    )
    assert r.status_code == 200, r.text
    _mark_verified(e)
    r = client.post(
        "/api/auth/login", json={"identifier": u, "password": "password123"}
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    if "access_token" in data:
        return {"Authorization": f"Bearer {data['access_token']}"}, u
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=e).first()
        db.query(VerificationCode).filter_by(
            code_hash=hashlib.sha256(b"123456").hexdigest()
        ).delete()
        db.add(
            VerificationCode(
                user_id=user.id,
                email=e,
                code_hash=hashlib.sha256(b"123456").hexdigest(),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
        )
        db.commit()
    finally:
        db.close()
    r2 = client.post("/api/auth/verify-login", json={"email": e, "code": "123456"})
    assert r2.status_code == 200, r2.text
    return {"Authorization": f"Bearer {r2.json()['data']['access_token']}"}, u


def make_list(h, name="Club", members=()):
    payload = {"name": name}
    if members:
        payload["member_usernames"] = list(members)
    else:
        # create() requires >=1 valid member; caller passes at least one
        raise AssertionError("need a seed member")
    r = client.post("/api/broadcasts", json=payload, headers=h)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_owner_lists_members_without_leaking_private_fields():
    ho, _ = make_user()
    _, m1 = make_user()
    bl = make_list(ho, members=[m1])
    r = client.get(f"/api/broadcasts/{bl['id']}/members", headers=ho)
    assert r.status_code == 200, r.text
    members = r.json()["data"]["members"]
    assert [m["username"] for m in members] == [m1]
    assert set(members[0].keys()) == {"id", "username", "display_name", "avatar_url"}
    assert r.json()["data"]["list"]["member_count"] == 1


def test_non_owner_gets_masked_404_on_members():
    ho, _ = make_user()
    hx, _ = make_user()
    _, m1 = make_user()
    bl = make_list(ho, members=[m1])
    r = client.get(f"/api/broadcasts/{bl['id']}/members", headers=hx)
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "Broadcast list not found"
    assert "members" not in r.text or m1 not in r.text


def test_add_by_username_and_user_id_then_duplicate_is_idempotent():
    ho, _ = make_user()
    _, m1 = make_user()
    h2, m2 = make_user()
    bl = make_list(ho, members=[m1])
    r = client.post(
        f"/api/broadcasts/{bl['id']}/members", json={"username": m2}, headers=ho
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["member_count"] == 2
    db = SessionLocal()
    try:
        uid2 = db.query(User).filter_by(username=m2).first().id
    finally:
        db.close()
    r = client.post(
        f"/api/broadcasts/{bl['id']}/members", json={"user_id": uid2}, headers=ho
    )
    assert r.status_code == 200, r.text
    assert r.json()["message"] == "Already a member"
    assert r.json()["data"]["member_count"] == 2
    # raw storage has no duplicates
    r = client.get(f"/api/broadcasts/{bl['id']}/members", headers=ho)
    ids = [m["id"] for m in r.json()["data"]["members"]]
    assert len(ids) == len(set(ids)) == 2
    assert h2 is not None


def test_add_validation_and_non_owner_rejected():
    ho, _ = make_user()
    hx, _ = make_user()
    _, m1 = make_user()
    bl = make_list(ho, members=[m1])
    # unknown user
    r = client.post(
        f"/api/broadcasts/{bl['id']}/members",
        json={"username": "ghost_xyz_123"},
        headers=ho,
    )
    assert r.status_code == 404, r.text
    # no target
    r = client.post(f"/api/broadcasts/{bl['id']}/members", json={}, headers=ho)
    assert r.status_code == 400, r.text
    # both targets
    r = client.post(
        f"/api/broadcasts/{bl['id']}/members",
        json={"user_id": 1, "username": m1},
        headers=ho,
    )
    assert r.status_code == 400, r.text
    # self add (create discards self — preserved here)
    r = client.post(
        f"/api/broadcasts/{bl['id']}/members",
        json={"username": _own_username(ho)},
        headers=ho,
    )
    assert r.status_code == 400, r.text
    # non-owner add masked
    r = client.post(
        f"/api/broadcasts/{bl['id']}/members", json={"username": m1}, headers=hx
    )
    assert r.status_code == 404, r.text
    # non-owner remove masked
    r = client.delete(f"/api/broadcasts/{bl['id']}/members/999999", headers=hx)
    assert r.status_code == 404, r.text


def _own_username(h):
    import jwt as _jwt

    token = h["Authorization"].split(" ", 1)[1]
    payload = _jwt.decode(token, options={"verify_signature": False})
    return payload["username"]


def test_remove_member_and_absent_is_deterministic():
    ho, _ = make_user()
    _, m1 = make_user()
    _, m2 = make_user()
    bl = make_list(ho, members=[m1, m2])
    db = SessionLocal()
    try:
        uid1 = db.query(User).filter_by(username=m1).first().id
    finally:
        db.close()
    r = client.delete(f"/api/broadcasts/{bl['id']}/members/{uid1}", headers=ho)
    assert r.status_code == 200, r.text
    assert r.json()["message"] == "Removed from list"
    assert r.json()["data"]["member_count"] == 1
    r = client.delete(f"/api/broadcasts/{bl['id']}/members/{uid1}", headers=ho)
    assert r.status_code == 200, r.text
    assert r.json()["message"] == "Not a member"


def test_membership_limit_enforced():
    from app.services import broadcasts as svc

    assert svc.MAX_BROADCAST_MEMBERS >= 2
    ho, _ = make_user()
    _, m1 = make_user()
    bl = make_list(ho, members=[m1])
    import app.services.broadcasts as svcmod

    old = svcmod.MAX_BROADCAST_MEMBERS
    svcmod.MAX_BROADCAST_MEMBERS = 1
    try:
        _, m2 = make_user()
        r = client.post(
            f"/api/broadcasts/{bl['id']}/members", json={"username": m2}, headers=ho
        )
        assert r.status_code == 400, r.text
        assert "full" in r.json()["detail"]
    finally:
        svcmod.MAX_BROADCAST_MEMBERS = old


def test_dead_member_ids_are_tolerated_by_members_and_send():
    ho, _ = make_user()
    _, m1 = make_user()
    bl = make_list(ho, members=[m1])
    db = SessionLocal()
    try:
        from app.models.broadcast import BroadcastList

        row = db.query(BroadcastList).filter_by(id=bl["id"]).first()
        row.member_ids = [*(row.member_ids or []), 987654321]
        db.commit()
    finally:
        db.close()
    r = client.get(f"/api/broadcasts/{bl['id']}/members", headers=ho)
    assert r.status_code == 200, r.text
    assert [m["username"] for m in r.json()["data"]["members"]] == [m1]
    r = client.post(
        f"/api/broadcasts/{bl['id']}/send", json={"content": "hi all"}, headers=ho
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["data"]["sent_to"]) == 1


def test_send_reflects_membership_changes():
    ho, _ = make_user()
    _, m1 = make_user()
    _, m2 = make_user()
    bl = make_list(ho, members=[m1, m2])
    db = SessionLocal()
    try:
        uid1 = db.query(User).filter_by(username=m1).first().id
        uid2 = db.query(User).filter_by(username=m2).first().id
    finally:
        db.close()
    client.delete(f"/api/broadcasts/{bl['id']}/members/{uid1}", headers=ho)
    r = client.post(
        f"/api/broadcasts/{bl['id']}/send",
        json={"content": "after removal"},
        headers=ho,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["sent_to"] == [uid2]
    # removed member's DM does not contain the new broadcast
    h1 = _login_as(m1)
    r = client.get("/api/conversations", headers=h1)
    bodies = [c.get("last_message", {}).get("content", "") for c in r.json()["data"]]
    assert "after removal" not in bodies
    # re-add → participates again
    r = client.post(
        f"/api/broadcasts/{bl['id']}/members", json={"username": m1}, headers=ho
    )
    assert r.status_code == 200, r.text
    r = client.post(
        f"/api/broadcasts/{bl['id']}/send", json={"content": "welcome back"}, headers=ho
    )
    assert uid1 in r.json()["data"]["sent_to"]


def _login_as(username):
    r = client.post(
        "/api/auth/login", json={"identifier": username, "password": "password123"}
    )
    data = r.json()["data"]
    if "access_token" in data:
        return {"Authorization": f"Bearer {data['access_token']}"}
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username=username).first()
        db.query(VerificationCode).filter_by(
            code_hash=hashlib.sha256(b"123456").hexdigest()
        ).delete()
        db.add(
            VerificationCode(
                user_id=user.id,
                email=user.email,
                code_hash=hashlib.sha256(b"123456").hexdigest(),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
        )
        db.commit()
        email = user.email
    finally:
        db.close()
    r2 = client.post("/api/auth/verify-login", json={"email": email, "code": "123456"})
    return {"Authorization": f"Bearer {r2.json()['data']['access_token']}"}
