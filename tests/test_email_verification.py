import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))
from app.main import app  # noqa: E402
from app.database.connection import SessionLocal, create_tables  # noqa: E402
from app.database.config import settings  # noqa: E402
from app.models.user import User  # noqa: E402
from app.api import auth as auth_module  # noqa: E402

create_tables()
client = TestClient(app)

# Resend is unset in tests: sends are skipped (fail-soft), codes still stored.
assert not (settings.RESEND_API_KEY or "").strip()


def _signup(username, email):
    r = client.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": username,
            "password": "pass123",
            "confirm_password": "pass123",
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _seed_code(email, code="123456"):
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=email).first()
        assert user is not None
        auth_module._code_store()[hashlib.sha256(code.encode()).hexdigest()] = {
            "user_id": user.id,
            "email": email,
            "expires": datetime.now(timezone.utc) + timedelta(minutes=10),
        }
        return user.id
    finally:
        db.close()


def test_signup_reports_verification_not_sent_without_resend():
    suffix = str(int(time.time() * 1000))[-6:]
    data = _signup(f"vuser{suffix}", f"vuser{suffix}@ex.com")["data"]
    assert data["verification_sent"] is False
    assert data["user"]["email_verified"] is False


def test_send_verification_cooldown():
    suffix = str(int(time.time() * 1000))[-6:]
    email = f"cool{suffix}@ex.com"
    _signup(f"cool{suffix}", email)
    # Signup already issued a code -> immediate resend hits the cooldown.
    r0 = client.post("/api/auth/send-verification", json={"email": email})
    assert r0.status_code == 429
    # After the cooldown window, resending works (fail-soft: sent False here).
    auth_module._code_cooldowns().pop(email, None)
    r1 = client.post("/api/auth/send-verification", json={"email": email})
    assert r1.status_code == 200
    assert r1.json()["data"]["sent"] is False  # no Resend key in tests


def test_verify_email_rejects_bad_code():
    suffix = str(int(time.time() * 1000))[-6:]
    email = f"bad{suffix}@ex.com"
    _signup(f"bad{suffix}", email)
    r = client.post("/api/auth/verify-email", json={"email": email, "code": "000000"})
    assert r.status_code == 400
    r = client.post("/api/auth/verify-email", json={"email": email, "code": "abc"})
    assert r.status_code == 400


def test_verify_email_happy_path_single_use():
    suffix = str(int(time.time() * 1000))[-6:]
    email = f"good{suffix}@ex.com"
    _signup(f"good{suffix}", email)
    _seed_code(email)
    r = client.post("/api/auth/verify-email", json={"email": email, "code": "123456"})
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        assert db.query(User).filter_by(email=email).first().email_verified is True
    finally:
        db.close()
    # Same code cannot be reused.
    r = client.post("/api/auth/verify-email", json={"email": email, "code": "123456"})
    assert r.status_code == 400


def test_forgot_password_dev_token_preserved_without_resend():
    suffix = str(int(time.time() * 1000))[-6:]
    email = f"fp{suffix}@ex.com"
    _signup(f"fp{suffix}", email)
    r = client.post("/api/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    # No sender configured in tests: dev still returns the token.
    assert r.json()["data"]["token"]
