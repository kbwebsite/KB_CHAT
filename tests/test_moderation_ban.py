"""Ban-by-email, full erase, appeal approval, blocked re-signup."""

import os
import sys
import time

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database.config import settings  # noqa: E402
from app.database.connection import SessionLocal, create_tables  # noqa: E402
from app.main import app  # noqa: E402
from app.models.ban import EmailBan  # noqa: E402
from app.models.message import Message  # noqa: E402
from app.models.user import User  # noqa: E402

create_tables()
client = TestClient(app, raise_server_exceptions=False)


def _unique(prefix):
    return f"{prefix}{str(int(time.time() * 1000))[-6:]}{os.getpid() % 1000}"


def _signup(username=None):
    username = username or _unique("ban")
    email = f"{username}@example.com"
    jar = TestClient(app, raise_server_exceptions=False)
    r = jar.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": username,
            "password": "BanPass123",
            "confirm_password": "BanPass123",
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


def _dm(token, peer_username):
    r = client.post(
        "/api/conversations",
        headers=_auth(token),
        json={"participant_username": peer_username},
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _username(uid):
    db = SessionLocal()
    try:
        return db.query(User).filter_by(id=uid).first().username
    finally:
        db.close()


def test_ban_by_email_deactivates_and_blocks_signup(monkeypatch):
    victim_uid, _, _, victim_email = _signup()
    admin_token, admin_email = _admin()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)

    # Non-admin refused; bad email refused.
    plain_token = _signup()[1]
    assert (
        client.post(
            "/api/moderation/bans",
            headers=_auth(plain_token),
            json={"email": victim_email},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/moderation/bans",
            headers=_auth(admin_token),
            json={"email": "not-an-email"},
        ).status_code
        == 400
    )
    # Self-ban refused.
    assert (
        client.post(
            "/api/moderation/bans",
            headers=_auth(admin_token),
            json={"email": admin_email},
        ).status_code
        == 400
    )

    r = client.post(
        "/api/moderation/bans",
        headers=_auth(admin_token),
        json={"email": victim_email, "reason": "spam"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["deactivated"] is True

    db = SessionLocal()
    try:
        assert db.query(User).filter_by(id=victim_uid).first().is_active is False
        assert (
            db.query(EmailBan).filter_by(email=victim_email.lower()).first() is not None
        )
    finally:
        db.close()

    # Banned address cannot sign up again (nor log back in).
    dup = client.post(
        "/api/auth/signup",
        json={
            "username": _unique("ghost"),
            "email": victim_email,
            "display_name": "Ghost",
            "password": "GhostPass123",
            "confirm_password": "GhostPass123",
        },
    )
    assert dup.status_code == 400
    assert "blocked" in dup.json()["detail"].lower()
    denied = client.post(
        "/api/auth/login",
        json={"identifier": victim_email, "password": "BanPass123"},
    )
    assert denied.status_code == 403

    # Ban list shows it; unban lifts the block (account stays off).
    listed = client.get("/api/moderation/bans", headers=_auth(admin_token))
    assert listed.status_code == 200
    row = next(
        (b for b in listed.json()["data"] if b["email"] == victim_email.lower()), None
    )
    assert row is not None
    un = client.delete(f"/api/moderation/bans/{row['id']}", headers=_auth(admin_token))
    assert un.status_code == 200
    db = SessionLocal()
    try:
        assert db.query(EmailBan).filter_by(email=victim_email.lower()).first() is None
        assert db.query(User).filter_by(id=victim_uid).first().is_active is False
    finally:
        db.close()


def test_delete_blocks_same_email_signup(monkeypatch):
    victim_uid, _, _, victim_email = _signup()
    admin_token, admin_email = _admin()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    r = client.post(
        f"/api/moderation/users/{victim_uid}/delete", headers=_auth(admin_token)
    )
    assert r.status_code == 200, r.text
    dup = client.post(
        "/api/auth/signup",
        json={
            "username": _unique("ghost"),
            "email": victim_email,
            "display_name": "Ghost",
            "password": "GhostPass123",
            "confirm_password": "GhostPass123",
        },
    )
    assert dup.status_code == 400
    assert "blocked" in dup.json()["detail"].lower()


def test_erase_removes_user_everywhere(monkeypatch):
    uid_a, token_a, _, email_a = _signup()
    uid_b, token_b, _, _ = _signup()
    _, _, _, _ = _signup()
    admin_token, admin_email = _admin()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)

    conv = _dm(token_a, _username(uid_b))
    r = client.post(
        f"/api/conversations/{conv}/messages",
        headers=_auth(token_a),
        json={"content": "hello from A"},
    )
    assert r.status_code == 200, r.text
    mid_a = r.json()["data"]["id"]
    r2 = client.post(
        f"/api/conversations/{conv}/messages",
        headers=_auth(token_b),
        json={"content": "hello from B"},
    )
    assert r2.status_code == 200, r2.text

    # A files a report (audit row referencing them), then gets erased.
    rep = client.post(
        "/api/moderation/reports",
        headers=_auth(token_a),
        json={"target_type": "user", "target_id": uid_b, "reason": "spam"},
    )
    assert rep.status_code == 200

    # Guards match delete: non-admin 403, self-erase by admin 400.
    assert (
        client.post(
            f"/api/moderation/users/{uid_b}/erase", headers=_auth(token_b)
        ).status_code
        == 403
    )
    db = SessionLocal()
    try:
        admin_uid = db.query(User).filter_by(email=admin_email.lower()).first().id
    finally:
        db.close()
    assert (
        client.post(
            f"/api/moderation/users/{admin_uid}/erase", headers=_auth(admin_token)
        ).status_code
        == 400
    )
    gone = client.post(
        f"/api/moderation/users/{uid_a}/erase", headers=_auth(admin_token)
    )
    assert gone.status_code == 200, gone.text

    db = SessionLocal()
    try:
        from app.database.connection import Base

        assert db.query(User).filter_by(id=uid_a).first() is None
        # No row anywhere still names them…
        assert db.query(Message).filter_by(sender_id=uid_a).count() == 0
        leftovers = 0
        for table in Base.metadata.tables.values():
            if table.name in ("users", "email_bans"):
                continue
            for fk in table.foreign_keys:
                if fk.column.table.name == "users" and fk.column.name == "id":
                    col = fk.parent
                    leftovers += db.query(table).filter(col == uid_a).count()
        assert leftovers == 0
        # …while the peer's own message survives.
        assert (
            db.query(Message).filter_by(id=r2.json()["data"]["id"]).first() is not None
        )
        # Erased message is gone (history keeps B's side only).
        assert db.query(Message).filter_by(id=mid_a).first() is None
        # Email blocked from coming back.
        assert db.query(EmailBan).filter_by(email=email_a.lower()).first() is not None
    finally:
        db.close()


def test_appeal_approved_reactivates(monkeypatch):
    victim_uid, _, _, victim_email = _signup()
    admin_token, admin_email = _admin()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    client.post(
        f"/api/moderation/users/{victim_uid}/deactivate", headers=_auth(admin_token)
    )
    ap = client.post(
        "/api/moderation/appeals",
        json={"email": victim_email, "message": "My bad, sorry."},
    )
    assert ap.status_code == 200
    queue = client.get("/api/moderation/reports", headers=_auth(admin_token))
    rid = next(
        i["id"]
        for i in queue.json()["data"]
        if i["target_id"] == victim_uid and (i["details"] or "").startswith("🔓")
    )
    # Non-appeal reports refuse the action.
    other = client.post(
        "/api/moderation/reports",
        headers=_auth(admin_token),
        json={"target_type": "user", "target_id": victim_uid, "reason": "spam"},
    )
    assert (
        client.post(
            f"/api/moderation/reports/{other.json()['data']['id']}/resolve",
            headers=_auth(admin_token),
            json={"action": "appeal_approved"},
        ).status_code
        == 400
    )
    ok = client.post(
        f"/api/moderation/reports/{rid}/resolve",
        headers=_auth(admin_token),
        json={"action": "appeal_approved"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["data"]["action_taken"] == "appeal_approved"
    retry = client.post(
        "/api/auth/login",
        json={"identifier": victim_email, "password": "BanPass123"},
    )
    assert retry.status_code == 200


def test_ban_by_user_id_from_report_card(monkeypatch):
    victim_uid, _, _, victim_email = _signup()
    admin_token, admin_email = _admin()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    assert (
        client.post(
            "/api/moderation/bans",
            headers=_auth(admin_token),
            json={"user_id": 999999999},
        ).status_code
        == 404
    )
    r = client.post(
        "/api/moderation/bans",
        headers=_auth(admin_token),
        json={"user_id": victim_uid, "reason": "spam"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["email"] == victim_email.lower()
    assert r.json()["data"]["deactivated"] is True
    db = SessionLocal()
    try:
        assert db.query(User).filter_by(id=victim_uid).first().is_active is False
        assert (
            db.query(EmailBan).filter_by(email=victim_email.lower()).first()
            is not None
        )
    finally:
        db.close()
