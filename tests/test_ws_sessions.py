"""Wave 2 Phase 3: WebSocket session enforcement + revocation sweep."""

import os
import sys
import time
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.auth.security import create_access_token, decode_token
from app.database.config import settings
from app.database.connection import SessionLocal, create_tables
from app.models.user import User
from app.main import app
from app.services import auth_sessions as svc
from test_websocket import _mark_verified, _login_token

create_tables()
client = TestClient(app)


def _new_user(prefix):
    s = f"{prefix}{str(int(time.time() * 1000))[-5:]}{os.getpid() % 97}"
    client.post(
        "/api/auth/signup",
        json={
            "username": s,
            "email": f"{s}@ex.com",
            "display_name": s,
            "password": "pass123",
            "confirm_password": "pass123",
        },
    )
    _mark_verified(f"{s}@ex.com")
    return s


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_ws_session_connect_and_ping(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    token = _login_token(_new_user("wss"))
    assert "sid" in decode_token(token)
    with client.websocket_connect(f"/ws/chat?token={token}") as ws:
        ws.send_json({"type": "ping", "payload": {}})
        assert ws.receive_json()["type"] == "pong"


def test_ws_legacy_connect_still_works(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    u = _new_user("wsl")
    db = SessionLocal()
    try:
        me = db.query(User).filter_by(username=u).first()
        legacy = create_access_token(
            {"sub": str(me.id), "username": me.username},
            expires_delta=timedelta(days=7),
        )
    finally:
        db.close()
    with client.websocket_connect(f"/ws/chat?token={legacy}") as ws:
        ws.send_json({"type": "ping", "payload": {}})
        assert ws.receive_json()["type"] == "pong"


def test_ws_invalid_and_revoked_rejected_1008(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    with pytest.raises(WebSocketDisconnect) as e:
        with client.websocket_connect("/ws/chat?token=garbage"):
            pass
    assert e.value.code == 1008
    token = _login_token(_new_user("wsr"))
    client.post("/api/auth/logout", headers=_h(token))
    with pytest.raises(WebSocketDisconnect) as e2:
        with client.websocket_connect(f"/ws/chat?token={token}"):
            pass
    assert e2.value.code == 1008


def test_ws_revoked_mid_connection_4401(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    token = _login_token(_new_user("wsx"))
    with client.websocket_connect(f"/ws/chat?token={token}") as ws:
        ws.send_json({"type": "ping", "payload": {}})
        assert ws.receive_json()["type"] == "pong"
        client.post("/api/auth/logout", headers=_h(token))
        # Sweep and/or per-message validation must end this socket with 4401.
        try:
            ws.send_json({"type": "ping", "payload": {}})
        except Exception:
            pass
        with pytest.raises(WebSocketDisconnect) as e:
            for _ in range(10):
                ws.receive_json()
        assert e.value.code == 4401


def test_ws_multi_session_isolation(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    u = _new_user("wsm")
    token_a = _login_token(u)
    token_b = _login_token(u)
    sid_a = decode_token(token_a)["sid"]
    with client.websocket_connect(f"/ws/chat?token={token_a}") as ws_a:
        with client.websocket_connect(f"/ws/chat?token={token_b}") as ws_b:
            db = SessionLocal()
            try:
                svc.revoke_session(db, sid_a, reason="logout")
            finally:
                db.close()
            try:
                ws_a.send_json({"type": "ping", "payload": {}})
            except Exception:
                pass
            with pytest.raises(WebSocketDisconnect) as e:
                for _ in range(10):
                    ws_a.receive_json()
            assert e.value.code == 4401
            ws_b.send_json({"type": "ping", "payload": {}})
            assert ws_b.receive_json()["type"] == "pong"


def test_ws_expired_and_foreign_sid_rejected(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ISSUE_ENABLED", True)
    u = _new_user("wse")
    token = _login_token(u)
    uid = int(decode_token(token)["sub"])
    db = SessionLocal()
    try:
        me = db.query(User).filter_by(id=uid).first()
        row, _ = svc.create_session(db, me.id, ttl_days=0)
        tok_exp = svc.issue_access_token(me, row.id)
        w = _new_user("wsf")
        wuser = db.query(User).filter_by(username=w).first()
        orow, _ = svc.create_session(db, wuser.id)
        tok_foreign = svc.issue_access_token(me, orow.id)
    finally:
        db.close()
    import time as _t

    _t.sleep(0.05)
    for bad in (tok_exp, tok_foreign):
        with pytest.raises(WebSocketDisconnect) as e:
            with client.websocket_connect(f"/ws/chat?token={bad}"):
                pass
        assert e.value.code == 1008


def test_manager_sweep_scoped_to_sid():
    import asyncio
    from app.websocket.manager import ConnectionManager

    mgr = ConnectionManager()
    closed = []

    class Fake:
        def __init__(self, name):
            self.name = name

        async def send_text(self, text):
            pass

        async def close(self, code=1000):
            closed.append((self.name, code))

        def __hash__(self):
            return id(self)

    async def go():
        a1, a2, b1 = Fake("a1"), Fake("a2"), Fake("b1")
        # connect() calls accept + presence (DB); bypass via direct maps.
        mgr.user_connections[1].update([a1, a2])
        mgr.user_connections[2].add(b1)
        mgr.socket_sids[a1] = "sid-a"
        mgr.socket_sids[a2] = "sid-a"
        mgr.socket_sids[b1] = "sid-b"
        mgr.sid_connections["sid-a"].update([a1, a2])
        mgr.sid_connections["sid-b"].add(b1)
        n = await mgr.close_session_sockets("sid-a")
        return n

    n = asyncio.run(go())
    assert n == 2
    assert sorted(closed) == [("a1", 4401), ("a2", 4401)]
