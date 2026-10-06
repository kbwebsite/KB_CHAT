"""Wave 1: channel service paths (previously untested domain)."""

import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.main import app
from app.database.connection import SessionLocal, create_tables
from app.models.user import User
from app.models.verification import VerificationCode

create_tables()
client = TestClient(app)


def _signup(username, email):
    r = client.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": username,
            "password": "password123",
            "confirm_password": "password123",
        },
    )
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        db.query(User).filter_by(email=email.lower()).first().email_verified = True
        db.commit()
    finally:
        db.close()


def _token(username):
    r = client.post(
        "/api/auth/login", json={"identifier": username, "password": "password123"}
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
    return r2.json()["data"]["access_token"]


def _users():
    s = str(int(time.time() * 1000))[-5:] + str(os.getpid() % 97)
    a, b = f"chown{s}", f"chfol{s}"
    _signup(a, f"{a}@ex.com")
    _signup(b, f"{b}@ex.com")
    return (
        {"Authorization": f"Bearer {_token(a)}"},
        {"Authorization": f"Bearer {_token(b)}"},
    )


def test_channel_lifecycle_and_gates():
    ho, hf = _users()
    r = client.post("/api/channels", json={"name": "Announcements"}, headers=ho)
    assert r.status_code == 200, r.text
    cid = r.json()["data"]["id"]
    assert r.json()["data"]["is_owner"] is True

    # empty name rejected
    assert (
        client.post("/api/channels", json={"name": "  "}, headers=ho).status_code == 400
    )
    # non-owner cannot edit
    assert (
        client.patch(
            f"/api/channels/{cid}", json={"name": "hijack"}, headers=hf
        ).status_code
        == 403
    )
    # owner edits
    r2 = client.patch(f"/api/channels/{cid}", json={"name": "News"}, headers=ho)
    assert r2.status_code == 200 and r2.json()["data"]["name"] == "News", r2.text
    # non-follower cannot read posts
    assert client.get(f"/api/channels/{cid}/posts", headers=hf).status_code == 403
    # follow then read
    assert client.post(f"/api/channels/{cid}/follow", headers=hf).status_code == 200
    assert client.get(f"/api/channels/{cid}/posts", headers=hf).status_code == 200
    # non-owner cannot post
    assert (
        client.post(
            f"/api/channels/{cid}/posts", json={"content": "hi"}, headers=hf
        ).status_code
        == 403
    )
    # owner posts; empty and overlong rejected
    assert (
        client.post(
            f"/api/channels/{cid}/posts", json={"content": " "}, headers=ho
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"/api/channels/{cid}/posts", json={"content": "x" * 2001}, headers=ho
        ).status_code
        == 400
    )
    rp = client.post(
        f"/api/channels/{cid}/posts", json={"content": "hello"}, headers=ho
    )
    assert rp.status_code == 200, rp.text
    rl = client.get(f"/api/channels/{cid}/posts", headers=hf)
    assert any(p["content"] == "hello" for p in rl.json()["data"]), rl.text
    # unfollow re-locks the feed
    assert client.delete(f"/api/channels/{cid}/follow", headers=hf).status_code == 200
    assert client.get(f"/api/channels/{cid}/posts", headers=hf).status_code == 403
    # delete; second delete 404s
    assert client.delete(f"/api/channels/{cid}", headers=ho).status_code == 200
    assert client.delete(f"/api/channels/{cid}", headers=ho).status_code == 404
