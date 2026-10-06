"""Wave 2 Phase 1: session-aware get_current_user enforcement."""

import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.auth.security import create_access_token, decode_token
from app.database.config import settings
from app.database.connection import SessionLocal, create_tables
from app.models.user import User
from app.models.verification import VerificationCode
from app.main import app
from app.services import auth_sessions as svc

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
    return data["access_token"], jar


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _on(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)


def test_logout_kills_access_token(monkeypatch):
    _on(monkeypatch)
    u, e = _unique("enf"), f"{_unique('enf')}@ex.com"
    _signup(u, e)
    access, jar = _login(u)
    assert jar.get("/api/auth/me", headers=_h(access)).status_code == 200
    assert jar.post("/api/auth/logout", headers=_h(access)).status_code == 200
    r = jar.get("/api/auth/me", headers=_h(access))
    assert r.status_code == 401, r.text


def test_revoked_sibling_isolation(monkeypatch):
    _on(monkeypatch)
    u, e = _unique("iso"), f"{_unique('iso')}@ex.com"
    _signup(u, e)
    access_a, _ = _login(u)
    access_b, _ = _login(u)
    sid_a = decode_token(access_a)["sid"]
    db = SessionLocal()
    try:
        svc.revoke_session(db, sid_a, reason="logout")
    finally:
        db.close()
    assert client.get("/api/auth/me", headers=_h(access_a)).status_code == 401
    assert client.get("/api/auth/me", headers=_h(access_b)).status_code == 200


def test_rotation_does_not_kill_current_access(monkeypatch):
    _on(monkeypatch)
    u, e = _unique("rot"), f"{_unique('rot')}@ex.com"
    _signup(u, e)
    access, jar = _login(u)
    r = jar.post("/api/auth/refresh")
    assert r.status_code == 200, r.text
    # pre-rotation access token (now `used` row) still authorizes
    assert jar.get("/api/auth/me", headers=_h(access)).status_code == 200


def test_expired_unknown_foreign_sid_rejected(monkeypatch):
    _on(monkeypatch)
    u, e = _unique("bad"), f"{_unique('bad')}@ex.com"
    _signup(u, e)
    access, _ = _login(u)
    uid = decode_token(access)["sub"]
    db = SessionLocal()
    try:
        me = db.query(User).filter_by(id=int(uid)).first()
        # expired session row
        row, _ = svc.create_session(db, me.id, ttl_days=0)
        tok_exp = svc.issue_access_token(me, row.id)
        # nonexistent sid, crafted with the real secret
        tok_none = create_access_token(
            {
                "sub": str(me.id),
                "username": me.username,
                "sid": "00000000-0000-0000-0000-000000000000",
            },
            expires_delta=timedelta(minutes=15),
        )
        # foreign sid: other user's session under my sub
        w = _unique("oth")
        _signup(w, f"{w}@ex.com")
        wuser = db.query(User).filter_by(username=w).first()
        orow, _ = svc.create_session(db, wuser.id)
        tok_foreign = svc.issue_access_token(me, orow.id)
    finally:
        db.close()
    import time as _t

    _t.sleep(0.05)
    assert client.get("/api/auth/me", headers=_h(tok_exp)).status_code == 401
    assert client.get("/api/auth/me", headers=_h(tok_none)).status_code == 401
    assert client.get("/api/auth/me", headers=_h(tok_foreign)).status_code == 401


def test_legacy_token_still_accepted(monkeypatch):
    _on(monkeypatch)
    u, e = _unique("leg"), f"{_unique('leg')}@ex.com"
    _signup(u, e)
    db = SessionLocal()
    try:
        me = db.query(User).filter_by(username=u).first()
        legacy = create_access_token(
            {"sub": str(me.id), "username": me.username},
            expires_delta=timedelta(days=7),
        )
    finally:
        db.close()
    assert client.get("/api/auth/me", headers=_h(legacy)).status_code == 200


def test_inactive_user_denied(monkeypatch):
    _on(monkeypatch)
    u, e = _unique("ina"), f"{_unique('ina')}@ex.com"
    _signup(u, e)
    access, _ = _login(u)
    db = SessionLocal()
    try:
        db.query(User).filter_by(username=u).first().is_active = False
        db.commit()
    finally:
        db.close()
    assert client.get("/api/auth/me", headers=_h(access)).status_code == 401
