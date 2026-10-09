"""Moderation queue: reports, admin gating, resolutions, user actions."""

import os
import sys
import time

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database.config import settings  # noqa: E402
from app.database.connection import SessionLocal, create_tables  # noqa: E402
from app.main import app  # noqa: E402
from app.models.message import Message  # noqa: E402
from app.models.user import User  # noqa: E402

create_tables()
client = TestClient(app, raise_server_exceptions=False)


def _unique(prefix):
    return f"{prefix}{str(int(time.time() * 1000))[-6:]}{os.getpid() % 1000}"


def _signup(username=None):
    """Returns (uid, access_token, jar, email); email pre-verified."""
    username = username or _unique("mod")
    email = f"{username}@example.com"
    jar = TestClient(app, raise_server_exceptions=False)
    r = jar.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": username,
            "password": "ModPass123",
            "confirm_password": "ModPass123",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(email=email.lower()).first()
        u.email_verified = True
        db.commit()
        uid = u.id
    finally:
        db.close()
    return uid, data["access_token"], jar, email


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _username(uid):
    db = SessionLocal()
    try:
        return db.query(User).filter_by(id=uid).first().username
    finally:
        db.close()


def _dm(token, peer_username):
    r = client.post(
        "/api/conversations",
        headers=_auth(token),
        json={"participant_username": peer_username},
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _send(token, conv, content):
    r = client.post(
        f"/api/conversations/{conv}/messages",
        headers=_auth(token),
        json={"content": content},
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def test_non_admin_cannot_read_queue():
    _, token, _, _ = _signup()
    assert (
        client.get("/api/moderation/reports", headers=_auth(token)).status_code == 403
    )
    assert (
        client.post(
            "/api/moderation/reports/1/resolve",
            headers=_auth(token),
            json={"action": "dismissed"},
        ).status_code
        == 403
    )
    assert client.get("/api/moderation/users", headers=_auth(token)).status_code == 403


def test_report_validation():
    uid_a, token_a, _, _ = _signup()
    uid_b, _, _, _ = _signup()
    bad_type = client.post(
        "/api/moderation/reports",
        headers=_auth(token_a),
        json={"target_type": "server", "target_id": 1, "reason": "spam"},
    )
    assert bad_type.status_code == 400
    bad_reason = client.post(
        "/api/moderation/reports",
        headers=_auth(token_a),
        json={"target_type": "user", "target_id": uid_b, "reason": "rude"},
    )
    assert bad_reason.status_code == 400
    missing = client.post(
        "/api/moderation/reports",
        headers=_auth(token_a),
        json={"target_type": "message", "target_id": 999999999, "reason": "spam"},
    )
    assert missing.status_code == 404
    assert uid_a != uid_b


def test_report_message_and_admin_flow(monkeypatch):
    uid_a, token_a, _, _ = _signup()
    uid_b, _, _, _ = _signup()
    _, admin_token, _, admin_email = _signup()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    conv = _dm(token_a, _username(uid_b))
    mid = _send(token_a, conv, "buy cheap watches now")
    r = client.post(
        "/api/moderation/reports",
        headers=_auth(admin_token),
        json={"target_type": "message", "target_id": mid, "reason": "spam"},
    )
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    assert body["status"] == "open" and body["target"]["sender_id"] == uid_a

    listed = client.get("/api/moderation/reports", headers=_auth(admin_token))
    assert listed.status_code == 200
    items = listed.json()["data"]
    assert any(
        i["id"] == body["id"] and i["target"]["snippet"] == "buy cheap watches now"
        for i in items
    )

    resolve = client.post(
        f"/api/moderation/reports/{body['id']}/resolve",
        headers=_auth(admin_token),
        json={"action": "message_deleted"},
    )
    assert resolve.status_code == 200, resolve.text
    assert resolve.json()["data"]["action_taken"] == "message_deleted"
    db = SessionLocal()
    try:
        assert db.query(Message).filter_by(id=mid).first().is_deleted is True
    finally:
        db.close()
    again = client.post(
        f"/api/moderation/reports/{body['id']}/resolve",
        headers=_auth(admin_token),
        json={"action": "dismissed"},
    )
    assert again.status_code == 400


def _uid_of(email):
    db = SessionLocal()
    try:
        return db.query(User).filter_by(email=email.lower()).first().id
    finally:
        db.close()


def test_direct_user_actions_and_me_flag(monkeypatch):
    uid_plain, token_plain, _, _ = _signup()
    _, admin_token, _, admin_email = _signup()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)

    me = client.get("/api/auth/me", headers=_auth(admin_token))
    assert me.json()["data"]["is_admin"] is True
    me2 = client.get("/api/auth/me", headers=_auth(token_plain))
    assert me2.json()["data"]["is_admin"] is False

    found = client.get("/api/moderation/users", headers=_auth(admin_token))
    assert found.status_code == 200 and found.json()["data"]

    off = client.post(
        f"/api/moderation/users/{uid_plain}/deactivate", headers=_auth(admin_token)
    )
    assert off.status_code == 200
    assert off.json()["data"]["is_active"] is False
    on = client.post(
        f"/api/moderation/users/{uid_plain}/reactivate", headers=_auth(admin_token)
    )
    assert on.status_code == 200
    assert on.json()["data"]["is_active"] is True
    assert (
        client.post(
            f"/api/moderation/users/{uid_plain}/deactivate", headers=_auth(token_plain)
        ).status_code
        == 403
    )


def test_resolve_user_deactivation_guards(monkeypatch):
    uid_victim, _, _, _ = _signup()
    _, admin_token, _, admin_email = _signup()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    # Non-admin cannot resolve at all.
    other_token = _signup()[1]
    r = client.post(
        "/api/moderation/reports",
        headers=_auth(other_token),
        json={"target_type": "user", "target_id": uid_victim, "reason": "scam"},
    )
    rid = r.json()["data"]["id"]
    assert (
        client.post(
            f"/api/moderation/reports/{rid}/resolve",
            headers=_auth(other_token),
            json={"action": "user_deactivated"},
        ).status_code
        == 403
    )
    # Admin resolving a normal user works and deactivates.
    ok = client.post(
        f"/api/moderation/reports/{rid}/resolve",
        headers=_auth(admin_token),
        json={"action": "user_deactivated"},
    )
    assert ok.status_code == 200, ok.text
    db = SessionLocal()
    try:
        assert db.query(User).filter_by(id=uid_victim).first().is_active is False
    finally:
        db.close()
    # True self-deactivation attempt is refused.
    admin_uid = _uid_of(admin_email)
    self_rep = client.post(
        "/api/moderation/reports",
        headers=_auth(admin_token),
        json={"target_type": "user", "target_id": admin_uid, "reason": "other"},
    )
    assert (
        client.post(
            f"/api/moderation/reports/{self_rep.json()['data']['id']}/resolve",
            headers=_auth(admin_token),
            json={"action": "user_deactivated"},
        ).status_code
        == 400
    )
    # Deactivating another flagged admin is refused.
    db = SessionLocal()
    try:
        other = db.query(User).filter(User.id != admin_uid).first()
        other.is_admin = True
        db.commit()
        other_id = other.id
    finally:
        db.close()
    other_rep = client.post(
        "/api/moderation/reports",
        headers=_auth(admin_token),
        json={"target_type": "user", "target_id": other_id, "reason": "scam"},
    )
    assert (
        client.post(
            f"/api/moderation/reports/{other_rep.json()['data']['id']}/resolve",
            headers=_auth(admin_token),
            json={"action": "user_deactivated"},
        ).status_code
        == 400
    )
