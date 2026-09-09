import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import create_tables

create_tables()
client = TestClient(app)


def _signup(username):
    r = client.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": f"{username}@ex.com",
            "display_name": username,
            "password": "password123",
            "confirm_password": "password123",
        },
    )
    assert r.status_code == 200, r.text


def _login(username):
    r = client.post(
        "/api/auth/login",
        json={"identifier": username, "password": "password123"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['data']['access_token']}"}


def test_push_token_register_upsert_unregister():
    s = str(int(time.time() * 1000))[-6:]
    u = f"pushuser{s}"
    _signup(u)
    h = _login(u)
    r = client.post(
        "/api/push/tokens",
        json={"token": "tok-abc", "platform": "web", "device_id": "d1"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    # upsert same token (new device label) stays one row, still 200
    r2 = client.post(
        "/api/push/tokens",
        json={"token": "tok-abc", "platform": "android", "device_id": "d2"},
        headers=h,
    )
    assert r2.status_code == 200, r2.text
    # bad platform normalizes, bad token rejected
    r3 = client.post(
        "/api/push/tokens", json={"token": "", "platform": "web"}, headers=h
    )
    assert r3.status_code == 400
    # unregister removes
    r4 = client.post(
        "/api/push/tokens/unregister", json={"token": "tok-abc"}, headers=h
    )
    assert r4.status_code == 200, r4.text


def test_push_status_endpoint_reports_disabled_without_creds():
    # No FIREBASE_CREDENTIALS_JSON in test env -> configured must be False,
    # and sends must no-op instead of raising.
    r = client.get("/api/push/status")
    assert r.status_code == 200
    assert r.json()["data"]["configured"] is False


def test_notify_helpers_noop_safely_without_creds():
    from app.utils import fcm

    assert fcm.is_configured() is False
    assert asyncio.run(fcm.send_to_token("x", "t", "b")) is False


def test_message_send_still_works_with_push_hook_enabled():
    # The push fan-out runs in the background task of create_message; a
    # message between two users must succeed and carry normal status.
    s = str(int(time.time() * 1000))[-6:]
    a, b = f"pa{s}", f"pb{s}"
    _signup(a)
    _signup(b)
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    # register a (useless, unconfigured) token for B — send must still succeed
    client.post(
        "/api/push/tokens", json={"token": "tok-b", "platform": "web"}, headers=hb
    )
    rm = client.post(
        f"/api/conversations/{cid}/messages",
        json={"content": "push path probe"},
        headers=ha,
    )
    assert rm.status_code == 200, rm.text
    assert rm.json()["data"]["status"] == "sent"
