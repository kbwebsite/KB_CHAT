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


def test_channel_post_reactions_and_delete():
    ho, hf = _users()
    r = client.post("/api/channels", json={"name": "Reacts"}, headers=ho)
    assert r.status_code == 200, r.text
    cid = r.json()["data"]["id"]
    rp = client.post(
        f"/api/channels/{cid}/posts", json={"content": "react to me"}, headers=ho
    )
    assert rp.status_code == 200, rp.text
    pid = rp.json()["data"]["id"]
    assert rp.json()["data"]["reactions"] == []

    # non-follower cannot react
    assert (
        client.post(
            f"/api/channels/{cid}/posts/{pid}/reactions",
            json={"emoji": "👍"},
            headers=hf,
        ).status_code
        == 403
    )
    # empty emoji rejected
    assert (
        client.post(
            f"/api/channels/{cid}/posts/{pid}/reactions",
            json={"emoji": "  "},
            headers=ho,
        ).status_code
        == 400
    )
    # follow then react on
    assert client.post(f"/api/channels/{cid}/follow", headers=hf).status_code == 200
    r1 = client.post(
        f"/api/channels/{cid}/posts/{pid}/reactions",
        json={"emoji": "👍"},
        headers=hf,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["data"]["reacted"] is True
    assert r1.json()["data"]["reactions"] == [{"emoji": "👍", "count": 1, "mine": True}]
    # owner reacts too — count aggregates, mine flags are per-user
    r2 = client.post(
        f"/api/channels/{cid}/posts/{pid}/reactions",
        json={"emoji": "👍"},
        headers=ho,
    )
    assert r2.json()["data"]["reactions"] == [{"emoji": "👍", "count": 2, "mine": True}]
    rl = client.get(f"/api/channels/{cid}/posts", headers=hf)
    got = [p for p in rl.json()["data"] if p["id"] == pid][0]
    assert got["reactions"] == [{"emoji": "👍", "count": 2, "mine": True}]
    # toggle off
    r3 = client.post(
        f"/api/channels/{cid}/posts/{pid}/reactions",
        json={"emoji": "👍"},
        headers=hf,
    )
    assert r3.json()["data"]["reacted"] is False
    assert r3.json()["data"]["reactions"] == [
        {"emoji": "👍", "count": 1, "mine": False}
    ]
    # non-owner cannot delete; owner deletes (reactions go with it)
    assert (
        client.delete(f"/api/channels/{cid}/posts/{pid}", headers=hf).status_code == 403
    )
    assert (
        client.delete(f"/api/channels/{cid}/posts/{pid}", headers=ho).status_code == 200
    )
    assert (
        client.post(
            f"/api/channels/{cid}/posts/{pid}/reactions",
            json={"emoji": "👍"},
            headers=ho,
        ).status_code
        == 404
    )
    assert client.delete(f"/api/channels/{cid}", headers=ho).status_code == 200


def test_channel_poll_lifecycle():
    ho, hf = _users()
    r = client.post("/api/channels", json={"name": "Polls"}, headers=ho)
    assert r.status_code == 200, r.text
    cid = r.json()["data"]["id"]

    # need 2+ options
    assert (
        client.post(
            f"/api/channels/{cid}/polls",
            json={"question": "Best?", "options": ["Only"]},
            headers=ho,
        ).status_code
        == 400
    )
    # non-owner cannot create
    assert (
        client.post(
            f"/api/channels/{cid}/polls",
            json={"question": "Best?", "options": ["A", "B"]},
            headers=hf,
        ).status_code
        == 403
    )
    rp = client.post(
        f"/api/channels/{cid}/polls",
        json={"question": "Best?", "options": ["A", "B", "C"]},
        headers=ho,
    )
    assert rp.status_code == 200, rp.text
    poll = rp.json()["data"]
    assert poll["total_votes"] == 0 and len(poll["options"]) == 3
    pid = poll["id"]
    opt_a, opt_b = poll["options"][0]["id"], poll["options"][1]["id"]

    # non-follower cannot vote
    assert (
        client.post(
            f"/api/channels/{cid}/polls/{pid}/vote",
            json={"option_ids": [opt_a]},
            headers=hf,
        ).status_code
        == 403
    )
    assert client.post(f"/api/channels/{cid}/follow", headers=hf).status_code == 200
    # bad option rejected
    assert (
        client.post(
            f"/api/channels/{cid}/polls/{pid}/vote",
            json={"option_ids": [999999]},
            headers=hf,
        ).status_code
        == 400
    )
    # vote A
    rv = client.post(
        f"/api/channels/{cid}/polls/{pid}/vote",
        json={"option_ids": [opt_a]},
        headers=hf,
    )
    assert rv.status_code == 200, rv.text
    assert rv.json()["data"]["total_votes"] == 1
    # change mind to B (single choice replaces)
    rv2 = client.post(
        f"/api/channels/{cid}/polls/{pid}/vote",
        json={"option_ids": [opt_b]},
        headers=hf,
    )
    got = {o["id"]: o["vote_count"] for o in rv2.json()["data"]["options"]}
    assert rv2.json()["data"]["total_votes"] == 1
    assert got[opt_a] == 0 and got[opt_b] == 1
    mine = [o for o in rv2.json()["data"]["options"] if o["id"] == opt_b][0]
    assert len(mine["voter_ids"]) == 1
    # list shows my vote
    rl = client.get(f"/api/channels/{cid}/polls", headers=hf)
    assert rl.status_code == 200 and len(rl.json()["data"]) == 1
    # non-owner cannot close/delete
    assert (
        client.post(
            f"/api/channels/{cid}/polls/{pid}/close", json={}, headers=hf
        ).status_code
        == 403
    )
    assert (
        client.delete(f"/api/channels/{cid}/polls/{pid}", headers=hf).status_code == 403
    )
    # owner closes — votes rejected after
    assert (
        client.post(
            f"/api/channels/{cid}/polls/{pid}/close", json={}, headers=ho
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/channels/{cid}/polls/{pid}/vote",
            json={"option_ids": [opt_a]},
            headers=hf,
        ).status_code
        == 400
    )
    # owner deletes
    assert (
        client.delete(f"/api/channels/{cid}/polls/{pid}", headers=ho).status_code == 200
    )
    assert client.get(f"/api/channels/{cid}/polls", headers=hf).json()["data"] == []
    assert client.delete(f"/api/channels/{cid}", headers=ho).status_code == 200
