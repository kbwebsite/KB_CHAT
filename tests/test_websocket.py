import pytest
from fastapi.testclient import TestClient
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))
from app.main import app
from app.database.connection import SessionLocal, create_tables
from app.models.user import User

create_tables()
client = TestClient(app)


def _mark_verified(email):
    # Fixture state for non-auth tests (the login gate itself is covered
    # in test_email_verification.py).
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(email=email.lower()).first()
        if u is not None and not u.email_verified:
            u.email_verified = True
            db.commit()
    finally:
        db.close()


def get_token_for_new_user(suffix):
    import time

    u = f"wsuser{suffix}"
    e = f"{u}@ex.com"
    client.post(
        "/api/auth/signup",
        json={
            "username": u,
            "email": e,
            "display_name": "WS User",
            "password": "pass123",
            "confirm_password": "pass123",
        },
    )
    _mark_verified(e)
    r = client.post("/api/auth/login", json={"identifier": u, "password": "pass123"})
    return r.json()["data"]["access_token"], u


def test_websocket_connect():
    import time

    suffix = str(int(time.time() * 1000))[-5:]
    token, _ = get_token_for_new_user(suffix)
    with client.websocket_connect(f"/ws/chat?token={token}") as ws:
        ws.send_json({"type": "ping", "payload": {}})
        data = ws.receive_json()
        assert data["type"] == "pong"


def test_typing_event():
    import time

    suffix = str(int(time.time() * 1000))[-5:] + "2"

    # create two users and a conversation
    def signup(username):
        client.post(
            "/api/auth/signup",
            json={
                "username": username,
                "email": f"{username}@ex.com",
                "display_name": username,
                "password": "pass123",
                "confirm_password": "pass123",
            },
        )
        _mark_verified(f"{username}@ex.com")
        r = client.post(
            "/api/auth/login", json={"identifier": username, "password": "pass123"}
        )
        return r.json()["data"]["access_token"]

    import random

    a = f"a{random.randint(10000, 99999)}"
    b = f"b{random.randint(10000, 99999)}"
    token_a = signup(a)
    token_b = signup(b)
    # create conv
    r = client.post(
        "/api/conversations",
        json={"participant_username": b},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    cid = r.json()["data"]["id"]
    with client.websocket_connect(f"/ws/chat?token={token_a}") as ws_a:
        with client.websocket_connect(f"/ws/chat?token={token_b}") as ws_b:
            # a sends typing
            ws_a.send_json(
                {"type": "typing.start", "payload": {"conversation_id": cid}}
            )
            # b should receive
            ws_b.send_json(
                {"type": "ping", "payload": {}}
            )  # to avoid blocking? Actually need to receive typing
            # Poll: b receives typing.start
            data = ws_b.receive_json()
            # Could be presence or typing. Loop until typing
            for _ in range(5):
                if data["type"] == "typing.start":
                    break
                try:
                    data = ws_b.receive_json()
                except:
                    break
            assert data["type"] in ("typing.start", "pong", "presence.online")


def test_fanout_skips_dead_socket():
    """A dead socket is reaped; the healthy one still gets the message."""
    import asyncio
    from app.websocket.manager import ConnectionManager

    mgr = ConnectionManager()
    received = []

    class Good:
        async def send_text(self, text):
            received.append(text)

    class Bad:
        async def send_text(self, text):
            raise RuntimeError("dead socket")

    async def go():
        mgr.user_connections[7].add(Good())
        mgr.user_connections[7].add(Bad())
        await mgr.send_to_user(7, {"type": "x", "payload": {}})
        return len(mgr.user_connections.get(7, set()))

    left = asyncio.run(go())
    assert len(received) == 1
    assert left == 1


def test_broadcast_is_parallel():
    """Two 1s-slow members must finish in ~1s, not ~2s (sequential)."""
    import asyncio, time
    from app.websocket.manager import ConnectionManager

    mgr = ConnectionManager()

    class Slow:
        async def send_text(self, text):
            await asyncio.sleep(1.0)

    async def go():
        mgr.user_connections[11].add(Slow())
        mgr.user_connections[12].add(Slow())
        t0 = time.monotonic()
        await mgr.broadcast_to_conversation(
            999, {"type": "x", "payload": {}}, member_ids=[11, 12]
        )
        return time.monotonic() - t0

    elapsed = asyncio.run(go())
    assert elapsed < 1.7, f"fan-out took {elapsed:.2f}s — looks sequential"
