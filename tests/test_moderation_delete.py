"""Delete-account + reactivation-appeal flows (moderation v2)."""

import os
import sys
import time

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database.config import settings  # noqa: E402
from app.database.connection import SessionLocal, create_tables  # noqa: E402
from app.main import app  # noqa: E402
from app.models.passkey import PasskeyCredential  # noqa: E402
from app.models.user import User  # noqa: E402

create_tables()
client = TestClient(app, raise_server_exceptions=False)


def _unique(prefix):
    return f"{prefix}{str(int(time.time() * 1000))[-6:]}{os.getpid() % 1000}"


def _signup(username=None):
    username = username or _unique("del")
    email = f"{username}@example.com"
    jar = TestClient(app, raise_server_exceptions=False)
    r = jar.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": username,
            "password": "DelPass123",
            "confirm_password": "DelPass123",
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


def _admin():
    _, admin_token, _, admin_email = _signup()
    return admin_token, admin_email


def test_delete_account_guards(monkeypatch):
    _, token_plain, _, _ = _signup()
    admin_token, admin_email = _admin()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    victim_uid, _, _, _ = _signup()

    # Non-admin refused.
    assert (
        client.post(
            f"/api/moderation/users/{victim_uid}/delete",
            headers=_auth(token_plain),
        ).status_code
        == 403
    )
    # Missing user.
    assert (
        client.post(
            "/api/moderation/users/999999999/delete", headers=_auth(admin_token)
        ).status_code
        == 404
    )
    # Self-delete refused.
    from app.database.connection import SessionLocal as _SL

    db = _SL()
    try:
        admin_uid = db.query(User).filter_by(email=admin_email.lower()).first().id
    finally:
        db.close()
    assert (
        client.post(
            f"/api/moderation/users/{admin_uid}/delete", headers=_auth(admin_token)
        ).status_code
        == 400
    )
    # Fellow admin refused.
    db = _SL()
    try:
        other = db.query(User).filter_by(id=victim_uid).first()
        other.is_admin = True
        db.commit()
    finally:
        db.close()
    assert (
        client.post(
            f"/api/moderation/users/{victim_uid}/delete", headers=_auth(admin_token)
        ).status_code
        == 400
    )


def test_delete_account_scrubs_and_blocks_login(monkeypatch):
    victim_uid, _, _, victim_email = _signup()
    admin_token, admin_email = _admin()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    db = SessionLocal()
    try:
        db.add(
            PasskeyCredential(
                user_id=victim_uid, credential_id="cred-1", public_key=b"pk-1"
            )
        )
        db.commit()
    finally:
        db.close()

    r = client.post(
        f"/api/moderation/users/{victim_uid}/delete", headers=_auth(admin_token)
    )
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    assert body["is_active"] is False
    assert body["username"] != "del"
    assert "deleted.local" in body["email"]

    db = SessionLocal()
    try:
        u = db.query(User).filter_by(id=victim_uid).first()
        assert u.display_name == "Deleted user"
        assert u.avatar_url is None and u.about is None
        assert u.identity_pubkey is None and u.email_verified is False
        assert db.query(PasskeyCredential).filter_by(user_id=victim_uid).count() == 0
        old_email_user = db.query(User).filter_by(email=victim_email.lower()).first()
        assert old_email_user is None
    finally:
        db.close()

    # Old credentials no longer work (unknown user now).
    bad = client.post(
        "/api/auth/login",
        json={"identifier": victim_email, "password": "DelPass123"},
    )
    assert bad.status_code in (401, 403)


def test_resolve_user_deleted_from_report(monkeypatch):
    victim_uid, _, _, _ = _signup()
    reporter_token = _signup()[1]
    admin_token, admin_email = _admin()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    r = client.post(
        "/api/moderation/reports",
        headers=_auth(reporter_token),
        json={"target_type": "user", "target_id": victim_uid, "reason": "spam"},
    )
    assert r.status_code == 200, r.text
    rid = r.json()["data"]["id"]
    ok = client.post(
        f"/api/moderation/reports/{rid}/resolve",
        headers=_auth(admin_token),
        json={"action": "user_deleted"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["data"]["action_taken"] == "user_deleted"
    assert ok.json()["data"]["status"] == "resolved"
    db = SessionLocal()
    try:
        assert (
            db.query(User).filter_by(id=victim_uid).first().display_name
            == "Deleted user"
        )
    finally:
        db.close()


def test_deactivated_login_blocked_and_appeal_flow(monkeypatch):
    victim_uid, _, _, victim_email = _signup()
    admin_token, admin_email = _admin()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)

    off = client.post(
        f"/api/moderation/users/{victim_uid}/deactivate", headers=_auth(admin_token)
    )
    assert off.status_code == 200

    # Password login is refused with a clear signal.
    denied = client.post(
        "/api/auth/login",
        json={"identifier": victim_email, "password": "DelPass123"},
    )
    assert denied.status_code == 403
    assert "disabled" in denied.json()["detail"].lower()

    # Appeal lands in the admin queue (as the user's own user-report).
    ap = client.post(
        "/api/moderation/appeals",
        json={"email": victim_email, "message": "Sorry, it was my sibling."},
    )
    assert ap.status_code == 200, ap.text
    queue = client.get("/api/moderation/reports", headers=_auth(admin_token))
    assert queue.status_code == 200
    appeals = [
        i
        for i in queue.json()["data"]
        if i["target_type"] == "user"
        and i["target_id"] == victim_uid
        and (i["details"] or "").startswith("🔓")
    ]
    assert len(appeals) == 1
    assert "sibling" in appeals[0]["details"]

    # Duplicate appeal while open: no second row.
    again = client.post(
        "/api/moderation/appeals",
        json={"email": victim_email, "message": "Please again"},
    )
    assert again.status_code == 200
    queue2 = client.get("/api/moderation/reports", headers=_auth(admin_token))
    appeals2 = [
        i
        for i in queue2.json()["data"]
        if i["target_type"] == "user"
        and i["target_id"] == victim_uid
        and (i["details"] or "").startswith("🔓")
    ]
    assert len(appeals2) == 1

    # Strangers and active accounts get the same neutral answer, no row.
    ghost = client.post(
        "/api/moderation/appeals",
        json={"email": "nobody-here@example.com", "message": "hi"},
    )
    assert ghost.status_code == 200
    assert "review" in ghost.json()["message"].lower()

    # Admin reactivates → password login proceeds past the gate.
    on = client.post(
        f"/api/moderation/users/{victim_uid}/reactivate", headers=_auth(admin_token)
    )
    assert on.status_code == 200
    retry = client.post(
        "/api/auth/login",
        json={"identifier": victim_email, "password": "DelPass123"},
    )
    assert retry.status_code == 200


def test_appeal_info_exposes_contact(monkeypatch):
    _, _, _, admin_email = _signup()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    r = client.get("/api/moderation/appeal-info")
    assert r.status_code == 200
    assert r.json()["data"]["contact_email"] == admin_email
