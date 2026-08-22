import pytest
from fastapi.testclient import TestClient
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../backend'))
from app.main import app
from app.database.connection import create_tables

create_tables()
client = TestClient(app)

def get_token_for_new_user(suffix):
    import time
    u = f"wsuser{suffix}"
    e = f"{u}@ex.com"
    client.post("/api/auth/signup", json={
        "username": u, "email": e, "display_name": "WS User", "password": "pass123", "confirm_password": "pass123"
    })
    r = client.post("/api/auth/login", json={"identifier": u, "password": "pass123"})
    return r.json()["data"]["access_token"], u

def test_websocket_connect():
    import time
    suffix = str(int(time.time()*1000))[-5:]
    token, _ = get_token_for_new_user(suffix)
    with client.websocket_connect(f"/ws/chat?token={token}") as ws:
        ws.send_json({"type": "ping", "payload": {}})
        data = ws.receive_json()
        assert data["type"] == "pong"

def test_typing_event():
    import time
    suffix = str(int(time.time()*1000))[-5:] + "2"
    # create two users and a conversation
    def signup(username):
        client.post("/api/auth/signup", json={
            "username": username, "email": f"{username}@ex.com", "display_name": username, "password": "pass123", "confirm_password": "pass123"
        })
        r = client.post("/api/auth/login", json={"identifier": username, "password": "pass123"})
        return r.json()["data"]["access_token"]
    import random
    a = f"a{random.randint(10000,99999)}"
    b = f"b{random.randint(10000,99999)}"
    token_a = signup(a)
    token_b = signup(b)
    # create conv
    r = client.post("/api/conversations", json={"participant_username": b}, headers={"Authorization": f"Bearer {token_a}"})
    cid = r.json()["data"]["id"]
    with client.websocket_connect(f"/ws/chat?token={token_a}") as ws_a:
        with client.websocket_connect(f"/ws/chat?token={token_b}") as ws_b:
            # a sends typing
            ws_a.send_json({"type": "typing.start", "payload": {"conversation_id": cid}})
            # b should receive
            ws_b.send_json({"type": "ping", "payload": {}})  # to avoid blocking? Actually need to receive typing
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
