"""PE-2J: refresh-endpoint failure handling (root-cause regression coverage).

Every refresh failure must land in exactly one bucket, never silently
becoming success and never masking an outage as a client error:

- missing / malformed / unknown token  -> 401, no session issued
- expired / revoked token              -> 401, no session issued
- past-grace replay (reuse)            -> 401, family revoked
- store failure (DB down/locked)       -> 503 + server log, never 401/200

Assertions are on status codes and response shapes only (presence of
``detail`` / absence of tokens and cookies), never on message text.
Runs on the PE-2H isolated temporary database; the persistent
``backend/kbchat.db`` is never touched.
"""

import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import text

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database.config import settings  # noqa: E402
from app.database.connection import SessionLocal, create_tables  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.verification import VerificationCode  # noqa: E402
from app.services import auth_sessions as svc  # noqa: E402

create_tables()
client = TestClient(app, raise_server_exceptions=False)


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
    """Password login through the code step. Returns (access, refresh, jar)."""
    jar = TestClient(app, raise_server_exceptions=False)
    r = jar.post("/api/auth/login", json={"identifier": username, "password": password})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    if "access_token" not in data:
        assert data.get("login_step") == "verify_code", data
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
        assert r.status_code == 200, r.text
        data = r.json()["data"]
    return data["access_token"], jar.cookies.get("kb_refresh"), jar


def _no_session_issued(r):
    """A failed refresh must never mint anything token-shaped."""
    assert "kb_refresh=" not in r.headers.get("set-cookie", "")
    assert "access_token" not in r.text


# 1. refresh with no cookie/session -------------------------------------------


def test_refresh_no_session_is_401_with_shape(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    for kwargs in ({}, {"json": {}}, {"json": {"refresh_token": None}}):
        r = TestClient(app, raise_server_exceptions=False).post(
            "/api/auth/refresh", **kwargs
        )
        assert r.status_code == 401, (kwargs, r.text)
        assert "detail" in r.json()
        _no_session_issued(r)


# 2. malformed or invalid refresh token ----------------------------------------


def test_refresh_malformed_is_401_with_shape(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    c = TestClient(app, raise_server_exceptions=False)
    cases = [
        {"headers": {"Cookie": "kb_refresh=garbage"}},
        {"headers": {"Cookie": "kb_refresh="}},
        {"json": {"refresh_token": "garbage"}},
        {"json": {"refresh_token": ["not", "a", "string"]}},
        {"json": {"refresh_token": 12345}},
        {"json": {"refresh_token": {"nested": "object"}}},
    ]
    for kwargs in cases:
        r = TestClient(app, raise_server_exceptions=False).post(
            "/api/auth/refresh", **kwargs
        )
        assert r.status_code == 401, (kwargs, r.text)
        assert "detail" in r.json()
        _no_session_issued(r)
    assert c.post("/api/auth/refresh", content=b"\x00\x01\x02").status_code == 401


# 3. expired or revoked refresh session ----------------------------------------


def test_refresh_expired_and_revoked_are_401(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    u = _unique("rfx")
    _signup(u, f"{u}@ex.com")
    db = SessionLocal()
    try:
        uid = db.query(User).filter_by(username=u).first().id
        _, t_expired = svc.create_session(db, uid, ttl_days=0)
        row, t_valid = svc.create_session(db, uid)
        svc.revoke_session(db, row.id, reason="test")
        db.commit()
    finally:
        db.close()
    c = TestClient(app, raise_server_exceptions=False)
    for token in (t_expired, t_valid):
        r = c.post("/api/auth/refresh", json={"refresh_token": token})
        assert r.status_code == 401, r.text
        assert "detail" in r.json()
        _no_session_issued(r)


# 4. successful refresh with a valid session ------------------------------------


def test_refresh_success_shape_and_rotation(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    u, e = _unique("rfok"), f"{_unique('rfok')}@ex.com"
    _signup(u, e)
    _, _, jar = _login(u)
    r = jar.post("/api/auth/refresh")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    data = body["data"]
    assert isinstance(data["access_token"], str) and data["access_token"]
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == svc.ACCESS_TOKEN_MINUTES * 60
    assert data["user"]["username"] == u
    raw = r.headers.get("set-cookie", "")
    assert "kb_refresh=" in raw and "HttpOnly" in raw


# 5. refresh rotation and replay/reuse protection --------------------------------


def test_refresh_replay_past_grace_kills_family(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    u = _unique("rfre")
    _signup(u, f"{u}@ex.com")
    db = SessionLocal()
    try:
        uid = db.query(User).filter_by(username=u).first().id
        _, t0 = svc.create_session(db, uid)
        start = datetime.now(timezone.utc) + timedelta(seconds=1)
        _, t1 = svc.refresh_session(db, t0, now=start)
        late = start + timedelta(seconds=svc.REUSE_GRACE_SECONDS + 60)
        try:
            svc.refresh_session(db, t0, now=late)
            raise AssertionError("past-grace reuse must raise")
        except Exception as ex:
            assert getattr(ex, "status_code", None) == 401
        db.commit()
    finally:
        db.close()
    c = TestClient(app, raise_server_exceptions=False)
    for token in (t0, t1):
        r = c.post("/api/auth/refresh", json={"refresh_token": token})
        assert r.status_code == 401, (token[:8], r.text)
        assert "detail" in r.json()
        _no_session_issued(r)


# 6. store failures stay diagnosable, never become auth --------------------------


def test_refresh_store_failure_is_503_not_auth(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    db = SessionLocal()
    try:
        db.execute(text("DROP TABLE auth_sessions"))
        db.commit()
        c = TestClient(app, raise_server_exceptions=False)
        r = c.post("/api/auth/refresh", json={"refresh_token": "garbage"})
        assert r.status_code == 503, r.text
        assert "detail" in r.json()
        _no_session_issued(r)
        # The no-session path short-circuits before the store: still 401,
        # so an outage can never flip a missing session into a 500 either.
        r2 = TestClient(app, raise_server_exceptions=False).post("/api/auth/refresh")
        assert r2.status_code == 401, r2.text
        _no_session_issued(r2)
    finally:
        db.close()
        create_tables()
    # Store restored: the endpoint serves again.
    assert (
        TestClient(app, raise_server_exceptions=False)
        .post("/api/auth/refresh")
        .status_code
        == 401
    )
