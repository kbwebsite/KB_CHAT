"""Wave 2 Phase 4: password events invalidate sessions (approved policy)."""

import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.auth.security import decode_token
from app.database.config import settings
from app.database.connection import SessionLocal, create_tables
from app.models.user import User
from app.models.verification import VerificationCode
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
    return data["access_token"], jar.cookies.get("kb_refresh"), jar


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _on(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)


def test_change_keeps_current_kills_others(monkeypatch):
    _on(monkeypatch)
    u, e = _unique("pwc"), f"{_unique('pwc')}@ex.com"
    _signup(u, e)
    access1, _, jar1 = _login(u)
    access2, cookie2, _ = _login(u)
    r = jar1.patch(
        "/api/users/me/password",
        json={"current_password": "password123", "new_password": "newpass123"},
        headers=_h(access1),
    )
    assert r.status_code == 200, r.text
    # current survives on both transports
    assert jar1.get("/api/auth/me", headers=_h(access1)).status_code == 200
    assert jar1.post("/api/auth/refresh").status_code == 200
    # others are dead on both transports
    assert client.get("/api/auth/me", headers=_h(access2)).status_code == 401
    c = TestClient(app)
    assert (
        c.post("/api/auth/refresh", json={"refresh_token": cookie2}).status_code == 401
    )
    # Phase 5: revoked sessions disappear from the list; current stays current
    listed = jar1.get("/api/auth/sessions", headers=_h(access1)).json()["data"]
    assert all(
        i["is_current"] == (i["id"] == decode_token(access1)["sid"]) for i in listed
    )
    assert decode_token(access2)["sid"] not in {i["id"] for i in listed}


def test_change_failure_revokes_nothing(monkeypatch):
    _on(monkeypatch)
    u, e = _unique("pwf"), f"{_unique('pwf')}@ex.com"
    _signup(u, e)
    access1, _, _ = _login(u)
    access2, _, jar2 = _login(u)
    r = jar2.patch(
        "/api/users/me/password",
        json={"current_password": "wrongpw1", "new_password": "newpass123"},
        headers=_h(access2),
    )
    assert r.status_code == 400
    assert client.get("/api/auth/me", headers=_h(access1)).status_code == 200
    assert client.get("/api/auth/me", headers=_h(access2)).status_code == 200


def test_reset_kills_all_sessions(monkeypatch):
    _on(monkeypatch)
    u, e = _unique("pwr"), f"{_unique('pwr')}@ex.com"
    _signup(u, e)
    access1, cookie1, _ = _login(u)
    access2, cookie2, _ = _login(u)
    r = client.post("/api/auth/forgot-password", json={"email": e})
    assert r.status_code == 200, r.text
    token = r.json()["data"]["token"]
    r2 = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "brandnew1"}
    )
    assert r2.status_code == 200, r2.text
    for access in (access1, access2):
        assert client.get("/api/auth/me", headers=_h(access)).status_code == 401
    c = TestClient(app)
    for cookie in (cookie1, cookie2):
        assert (
            c.post("/api/auth/refresh", json={"refresh_token": cookie}).status_code
            == 401
        )
    # new password works and mints a fresh session
    fresh, _, _ = _login(u, "brandnew1")
    assert client.get("/api/auth/me", headers=_h(fresh)).status_code == 200


def test_change_closes_sockets_current_revives(monkeypatch):
    _on(monkeypatch)
    from starlette.websockets import WebSocketDisconnect

    u, e = _unique("pws"), f"{_unique('pws')}@ex.com"
    _signup(u, e)
    access1, _, jar1 = _login(u)
    access2, _, _ = _login(u)
    with client.websocket_connect(f"/ws/chat?token={access1}") as ws1:
        with client.websocket_connect(f"/ws/chat?token={access2}") as ws2:
            ws1.send_json({"type": "ping", "payload": {}})
            assert ws1.receive_json()["type"] == "pong"
            jar1.patch(
                "/api/users/me/password",
                json={"current_password": "password123", "new_password": "newpass123"},
                headers=_h(access1),
            )
            # Surviving session stays usable on the wire...
            ws1.send_json({"type": "ping", "payload": {}})
            assert ws1.receive_json()["type"] == "pong"
            # ...while the revoked sibling dies on next traffic (per-message
            # validation; the sweep is the fast path in prod with lifespan).
            try:
                ws2.send_json({"type": "ping", "payload": {}})
            except Exception:
                pass
            with pytest.raises(WebSocketDisconnect) as ex:
                for _ in range(10):
                    ws2.receive_json()
            assert ex.value.code == 4401
    # current session revives over refresh + reconnect
    r = jar1.post("/api/auth/refresh")
    assert r.status_code == 200, r.text
    new_access = r.json()["data"]["access_token"]
    with client.websocket_connect(f"/ws/chat?token={new_access}") as ws3:
        ws3.send_json({"type": "ping", "payload": {}})
        assert ws3.receive_json()["type"] == "pong"
