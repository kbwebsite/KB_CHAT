"""Wave 4B Priority 2: fan-out protection (bounded, semantics-preserving)."""

import asyncio
import hashlib
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.database.connection import SessionLocal, create_tables
from app.models.user import User
from app.models.verification import VerificationCode
from app.main import app
from app.websocket.manager import ConnectionManager, manager

create_tables()
client = TestClient(app)


def test_typing_throttle_predicate():
    m = ConnectionManager()
    assert m.typing_allowed(1, 9, now=1000.0) is True
    assert m.typing_allowed(1, 9, now=1001.0) is False
    assert m.typing_allowed(1, 9, now=1003.5) is True
    assert m.typing_allowed(2, 9, now=1001.0) is True  # other user unaffected
    assert m.typing_allowed(1, 10, now=1001.0) is True  # other conv unaffected


def test_typing_map_prune_bounded():
    m = ConnectionManager()
    base = 1000.0
    for i in range(1005):
        m.typing_allowed(i, 1, now=base)
    assert len(m._typing_last) == 1005
    m.typing_allowed(9999, 1, now=base + 61.0)
    assert len(m._typing_last) < 1005  # stale entries pruned


def test_broadcast_chunked_delivery_complete():
    m = ConnectionManager()
    received = []

    class Fake:
        def __init__(self, uid):
            self.uid = uid

        async def send_text(self, text):
            received.append(self.uid)

    async def go():
        for uid in range(250):
            m.user_connections[uid].add(Fake(uid))
        old, m.FANOUT_CHUNK_SIZE = m.FANOUT_CHUNK_SIZE, 3
        try:
            await m.broadcast_to_conversation(
                1, {"type": "x"}, member_ids=list(range(250))
            )
        finally:
            m.FANOUT_CHUNK_SIZE = old
            m.user_connections.clear()

    asyncio.run(go())
    assert sorted(received) == list(range(250))


def _unique(prefix):
    return f"{prefix}{str(int(time.time() * 1000))[-6:]}{os.getpid() % 1000}"


def _login_token(username, password="password123"):
    jar = TestClient(app)
    r = jar.post("/api/auth/login", json={"identifier": username, "password": password})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    if "access_token" in data:
        return data["access_token"], jar
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
    r2 = jar.post("/api/auth/verify-login", json={"email": email, "code": "123456"})
    return r2.json()["data"]["access_token"], jar


def test_socket_cap_enforced_and_cleaned():
    u, e = _unique("cap"), f"{_unique('cap')}@ex.com"
    r = client.post(
        "/api/auth/signup",
        json={
            "username": u,
            "email": e,
            "display_name": u,
            "password": "password123",
            "confirm_password": "password123",
        },
    )
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        me = db.query(User).filter_by(email=e).first()
        me.email_verified = True
        db.commit()
        uid = me.id
    finally:
        db.close()
    token, _ = _login_token(u)

    class Fake:
        async def send_text(self, text):
            pass

    fakes = [Fake() for _ in range(manager.MAX_SOCKETS_PER_USER)]
    try:
        for f in fakes:
            manager.user_connections[uid].add(f)
        assert manager.socket_count(uid) == manager.MAX_SOCKETS_PER_USER
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect(f"/ws/chat?token={token}"):
                pass
        assert exc.value.code == 1008
    finally:
        for f in fakes:
            manager.user_connections[uid].discard(f)
        if not manager.user_connections.get(uid):
            manager.user_connections.pop(uid, None)
    assert manager.socket_count(uid) == 0
    # normal connect still works after cleanup (behavior preserved)
    with client.websocket_connect(f"/ws/chat?token={token}") as ws:
        ws.send_json({"type": "ping", "payload": {}})
        assert ws.receive_json()["type"] == "pong"
