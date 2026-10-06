"""Wave 1: canonical password-change endpoint (PATCH /api/users/me/password).

Covers the consolidated implementation in ``app/services/users.py`` served
through ``app/api/users.py`` after the shadowed ``extended.py`` duplicate
was removed. Asserts the exact live contract the frontend relies on
(``frontend/src/services/api.ts:249`` sends ``{current_password, new_password}``).
"""

import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.main import app
from app.database.connection import SessionLocal, create_tables
from app.models.user import User
from app.models.verification import VerificationCode

create_tables()
client = TestClient(app)

URL = "/api/users/me/password"


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
        u = db.query(User).filter_by(email=email.lower()).first()
        u.email_verified = True
        db.commit()
    finally:
        db.close()
    return r.json()["data"]


def _login_token(identifier, password):
    r = client.post(
        "/api/auth/login", json={"identifier": identifier, "password": password}
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
    assert r2.status_code == 200, r2.text
    return r2.json()["data"]["access_token"]


def test_exactly_one_password_route_registered():
    matches = [
        r
        for r in app.routes
        if getattr(r, "path", None) == URL and "PATCH" in getattr(r, "methods", set())
    ]
    assert len(matches) == 1, [getattr(r, "endpoint", None) for r in app.routes]


def test_change_password_success_and_login_with_new():
    u, e = _unique("pwduser"), f"{_unique('pwd')}@ex.com"
    _signup(u, e)
    token = _login_token(u, "password123")
    h = {"Authorization": f"Bearer {token}"}
    r = client.patch(
        URL,
        json={"current_password": "password123", "new_password": "newpass123"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["message"] == "Password changed successfully"
    # new password works, old one does not
    _login_token(u, "newpass123")
    r2 = client.post(
        "/api/auth/login", json={"identifier": u, "password": "password123"}
    )
    assert r2.status_code in (400, 401), r2.text


def test_change_password_wrong_current():
    u, e = _unique("pwdwrong"), f"{_unique('pwdw')}@ex.com"
    _signup(u, e)
    h = {"Authorization": f"Bearer {_login_token(u, 'password123')}"}
    r = client.patch(
        URL,
        json={"current_password": "nope12345", "new_password": "newpass123"},
        headers=h,
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Current password is incorrect"


def test_change_password_too_short():
    u, e = _unique("pwdshort"), f"{_unique('pwds')}@ex.com"
    _signup(u, e)
    h = {"Authorization": f"Bearer {_login_token(u, 'password123')}"}
    r = client.patch(
        URL, json={"current_password": "password123", "new_password": "abc"}, headers=h
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Password must be at least 6 characters"


def test_change_password_missing_fields_rejected_by_schema():
    u, e = _unique("pwdmis"), f"{_unique('pwdm')}@ex.com"
    _signup(u, e)
    h = {"Authorization": f"Bearer {_login_token(u, 'password123')}"}
    r = client.patch(URL, json={"current_password": "password123"}, headers=h)
    assert r.status_code == 422, r.text


def test_change_password_requires_auth():
    r = client.patch(
        URL, json={"current_password": "password123", "new_password": "newpass123"}
    )
    assert r.status_code in (401, 403), r.text
