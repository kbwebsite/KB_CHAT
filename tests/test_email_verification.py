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


def test_signup_without_username_autoderives():
    suffix = str(int(time.time() * 1000))[-6:]
    email = f"nouser{suffix}@ex.com"
    r = client.post(
        "/api/auth/signup",
        json={
            "display_name": "No Username",
            "email": email,
            "password": "pass123",
            "confirm_password": "pass123",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["user"]["username"].startswith(f"nouser{suffix}"[:8])


def _login_step(email):
    r = client.post(
        "/api/auth/login", json={"identifier": email, "password": "pass123"}
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_unverified_login_goes_through_code_step():
    """No more 403 gate: unverified sign-in enters the code step, and
    redeeming the code verifies the inbox and issues the session."""
    from app.utils import email as email_module

    real_send = email_module.send_verification_code
    email_module.send_verification_code = lambda to, code: True
    try:
        suffix = str(int(time.time() * 1000))[-6:]
        email = f"gate{suffix}@ex.com"
        _signup(f"gate{suffix}", email)
        # Cooldown from signup's own code must not 429 the login.
        data = _login_step(email)
        assert data.get("login_step") == "verify_code", data
        assert "access_token" not in data
        _seed_code(email)
        r = client.post(
            "/api/auth/verify-login", json={"email": email, "code": "123456"}
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["access_token"]
        assert r.json()["data"]["user"]["email_verified"] is True
    finally:
        email_module.send_verification_code = real_send


def test_verify_login_rejects_bad_code():
    suffix = str(int(time.time() * 1000))[-6:]
    email = f"badlogin{suffix}@ex.com"
    _signup(f"badlogin{suffix}", email)
    r = client.post(
        "/api/auth/verify-login", json={"email": email, "code": "000000"}
    )
    assert r.status_code == 400
    r = client.post("/api/auth/verify-login", json={"email": email, "code": "abc"})
    assert r.status_code == 400
    r = client.post(
        "/api/auth/verify-login",
        json={"email": "nobody@ex.com", "code": "123456"},
    )
    assert r.status_code == 400


def test_verify_login_code_single_use():
    suffix = str(int(time.time() * 1000))[-6:]
    email = f"once{suffix}@ex.com"
    _signup(f"once{suffix}", email)
    _seed_code(email)
    r = client.post(
        "/api/auth/verify-login", json={"email": email, "code": "123456"}
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/api/auth/verify-login", json={"email": email, "code": "123456"}
    )
    assert r.status_code == 400


def test_smtp_fallback_sends_without_resend(monkeypatch):
    """With only SMTP configured, send_email delivers via SMTP."""
    from app.utils import email as email_module

    sent = {}

    class FakeSMTP:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self):
            pass

        def login(self, user, password):
            sent["login"] = user

        def sendmail(self, sender, to, msg):
            sent["to"] = to
            sent["subject"] = "subject-ok" if "Subject" in msg else "missing"

    monkeypatch.setattr(email_module.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.gmail.com", raising=False)
    monkeypatch.setattr(settings, "SMTP_USER", "test@gmail.com", raising=False)
    monkeypatch.setattr(settings, "SMTP_PASS", "app-pass", raising=False)
    monkeypatch.setattr(settings, "RESEND_API_KEY", "", raising=False)
    assert email_module.email_configured() is True
    assert email_module.send_email("a@ex.com", "Hi", "<p>hi</p>", "hi") is True
    assert sent["to"] == ["a@ex.com"]


def test_sandbox_resend_does_not_shortcircuit_smtp(monkeypatch):
    """Sandbox sender + SMTP configured -> SMTP is tried first, Resend
    untouched (its 200-then-drop would otherwise eat the fallback)."""
    from app.utils import email as email_module

    calls = []

    class FakeSMTP:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def sendmail(self, sender, to, msg):
            calls.append(("smtp", to))

    def boom(*a, **k):
        calls.append(("resend", None))
        return True

    monkeypatch.setattr(email_module.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(email_module, "_send_via_resend", boom)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.gmail.com", raising=False)
    monkeypatch.setattr(settings, "SMTP_USER", "test@gmail.com", raising=False)
    monkeypatch.setattr(settings, "SMTP_PASS", "app-pass", raising=False)
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test", raising=False)
    monkeypatch.setattr(
        settings, "RESEND_FROM", "Kryzen <onboarding@resend.dev>", raising=False
    )
    assert email_module.send_email("a@ex.com", "Hi", "<p>hi</p>", "hi") is True
    assert calls == [("smtp", ["a@ex.com"])]


def test_forgot_password_dev_token_preserved_without_resend():
    suffix = str(int(time.time() * 1000))[-6:]
    email = f"fp{suffix}@ex.com"
    _signup(f"fp{suffix}", email)
    r = client.post("/api/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    # No sender configured in tests: dev still returns the token.
    assert r.json()["data"]["token"]
