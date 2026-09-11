import pytest
from fastapi.testclient import TestClient
import os
import sys

# Ensure backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.main import app
from app.database.connection import SessionLocal, create_tables, Base, engine

# Use test DB
# Override to in-memory? Use sqlite file for tests
create_tables()
client = TestClient(app)


def signup_user(username, email, display_name, password="password123"):
    return client.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": display_name,
            "password": password,
            "confirm_password": password,
        },
    )


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["success"] == True


def test_csp_allows_cloudinary_media():
    # Voice clips are served from Cloudinary; if media-src doesn't allow it
    # the browser blocks playback and messages silently won't play.
    r = client.get("/api/health")
    csp = r.headers.get("content-security-policy", "")
    assert "media-src" in csp, csp
    media = [p for p in csp.split(";") if "media-src" in p][0]
    assert "res.cloudinary.com" in media, csp


def test_signup_and_login():
    # unique suffix
    import time

    suffix = str(int(time.time() * 1000))[-6:]
    u = f"testuser{suffix}"
    e = f"test{suffix}@example.com"
    r = signup_user(u, e, "Test User")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] == True
    token = data["data"]["access_token"]
    assert token

    # login with username
    r2 = client.post(
        "/api/auth/login", json={"identifier": u, "password": "password123"}
    )
    assert r2.status_code == 200
    assert r2.json()["success"] == True

    # me
    r3 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert r3.json()["data"]["username"] == u.lower()


def test_user_search_and_conversation_flow():
    import time

    s = str(int(time.time() * 1000))[-6:]
    # create two users
    a = f"alice{s}"
    b = f"bob{s}"
    signup_user(a, f"{a}@ex.com", "Alice")
    signup_user(b, f"{b}@ex.com", "Bob")
    # login as alice
    r = client.post(
        "/api/auth/login", json={"identifier": a, "password": "password123"}
    )
    token_a = r.json()["data"]["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    # search for bob
    r2 = client.get(f"/api/users/search?q={b}", headers=headers_a)
    assert r2.status_code == 200
    assert any(u["username"] == b.lower() for u in r2.json()["data"])

    # create conversation
    r3 = client.post(
        "/api/conversations", json={"participant_username": b}, headers=headers_a
    )
    assert r3.status_code == 200, r3.text
    conv_id = r3.json()["data"]["id"]

    # send message
    r4 = client.post(
        f"/api/conversations/{conv_id}/messages",
        json={"content": "Hello!"},
        headers=headers_a,
    )
    assert r4.status_code == 200, r4.text
    assert r4.json()["data"]["content"] == "Hello!"

    # list messages
    r5 = client.get(f"/api/conversations/{conv_id}/messages", headers=headers_a)
    assert r5.status_code == 200
    assert len(r5.json()["data"]["messages"]) >= 1

    # login as bob and check he can see message
    r6 = client.post(
        "/api/auth/login", json={"identifier": b, "password": "password123"}
    )
    token_b = r6.json()["data"]["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    r7 = client.get(f"/api/conversations/{conv_id}/messages", headers=headers_b)
    assert r7.status_code == 200
    assert any(m["content"] == "Hello!" for m in r7.json()["data"]["messages"])

    # bob replies
    r8 = client.post(
        f"/api/conversations/{conv_id}/messages",
        json={"content": "Hi Alice!"},
        headers=headers_b,
    )
    assert r8.status_code == 200

    # alice sees reply
    r9 = client.get(f"/api/conversations/{conv_id}/messages", headers=headers_a)
    assert any(m["content"] == "Hi Alice!" for m in r9.json()["data"]["messages"])


def test_message_edit_delete():
    import time

    s = str(int(time.time() * 1000))[-5:]
    u = f"edituser{s}"
    signup_user(u, f"{u}@ex.com", "Edit User")
    r = client.post(
        "/api/auth/login", json={"identifier": u, "password": "password123"}
    )
    token = r.json()["data"]["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    # create self? need second user
    u2 = f"editbuddy{s}"
    signup_user(u2, f"{u2}@ex.com", "Buddy")
    r2 = client.post("/api/conversations", json={"participant_username": u2}, headers=h)
    cid = r2.json()["data"]["id"]
    # send
    r3 = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "original"}, headers=h
    )
    mid = r3.json()["data"]["id"]
    # edit
    r4 = client.patch(f"/api/messages/{mid}", json={"content": "edited"}, headers=h)
    assert r4.status_code == 200
    assert r4.json()["data"]["content"] == "edited"
    assert r4.json()["data"]["is_edited"] == True
    # delete
    r5 = client.delete(f"/api/messages/{mid}", headers=h)
    assert r5.status_code == 200
    assert r5.json()["data"]["is_deleted"] == True


def test_group_creation():
    import time

    s = str(int(time.time() * 1000))[-5:]
    owner = f"owner{s}"
    m1 = f"member1{s}"
    m2 = f"member2{s}"
    signup_user(owner, f"{owner}@ex.com", "Owner")
    signup_user(m1, f"{m1}@ex.com", "M1")
    signup_user(m2, f"{m2}@ex.com", "M2")
    r = client.post(
        "/api/auth/login", json={"identifier": owner, "password": "password123"}
    )
    token = r.json()["data"]["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    r2 = client.post(
        "/api/conversations",
        json={"is_group": True, "title": "Test Group", "member_usernames": [m1, m2]},
        headers=h,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["is_group"] == True
    assert len(r2.json()["data"]["members"]) == 3


def test_file_validation_unit():
    from app.utils.helpers import validate_file

    ok, _ = validate_file("test.jpg", "image/jpeg", 1024, 15)
    assert ok == True
    ok2, msg = validate_file("evil.exe", "application/octet-stream", 1024, 15)
    assert ok2 == False
    ok3, msg = validate_file("big.pdf", "application/pdf", 20 * 1024 * 1024, 15)
    assert ok3 == False


def _login(username):
    r = client.post(
        "/api/auth/login", json={"identifier": username, "password": "password123"}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['data']['access_token']}"}


def test_leaderboard_weekly_bounds_and_counts():
    import time

    s = str(int(time.time() * 1000))[-6:]
    u = f"lbuser{s}"
    signup_user(u, f"{u}@ex.com", "LB User")
    h = _login(u)
    # default (no period) must return week bounds for the countdown UI
    r = client.get("/api/users/leaderboard", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data.get("week_start") and data.get("week_end"), data
    # weekly scope counts this user's messages
    u2 = f"lbbuddy{s}"
    signup_user(u2, f"{u2}@ex.com", "LB Buddy")
    rc = client.post("/api/conversations", json={"participant_username": u2}, headers=h)
    cid = rc.json()["data"]["id"]
    client.post(
        f"/api/conversations/{cid}/messages", json={"content": "one"}, headers=h
    )
    client.post(
        f"/api/conversations/{cid}/messages", json={"content": "two"}, headers=h
    )
    r2 = client.get("/api/users/leaderboard?scope=global&period=weekly", headers=h)
    assert r2.status_code == 200, r2.text
    me = [x for x in r2.json()["data"]["users"] if x["is_current_user"]]
    assert me and me[0]["message_count"] >= 2, r2.text


def test_read_receipts_sent_delivered_read():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a = f"ra{s}"
    b = f"rb{s}"
    signup_user(a, f"{a}@ex.com", "Reader A")
    signup_user(b, f"{b}@ex.com", "Reader B")
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    # A sends -> fresh message is "sent" (single tick)
    r1 = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "ping"}, headers=ha
    )
    assert r1.status_code == 200, r1.text
    mid = r1.json()["data"]["id"]
    assert r1.json()["data"]["status"] == "sent"
    # B fetches history (arrival on device) -> A's view upgrades to delivered
    rb = client.get(f"/api/conversations/{cid}/messages", headers=hb)
    assert rb.status_code == 200
    ra = client.get(f"/api/conversations/{cid}/messages", headers=ha)
    mine = [m for m in ra.json()["data"]["messages"] if m["id"] == mid][0]
    assert mine["status"] == "delivered", mine
    # B marks read -> A's view upgrades to read
    rr = client.post(f"/api/messages/{mid}/read", headers=hb)
    assert rr.status_code == 200, rr.text
    ra2 = client.get(f"/api/conversations/{cid}/messages", headers=ha)
    mine2 = [m for m in ra2.json()["data"]["messages"] if m["id"] == mid][0]
    assert mine2["status"] == "read", mine2


def test_delivered_endpoint_acks_without_read():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a = f"da{s}"
    b = f"db{s}"
    signup_user(a, f"{a}@ex.com", "Dev A")
    signup_user(b, f"{b}@ex.com", "Dev B")
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    r1 = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "yo"}, headers=ha
    )
    mid = r1.json()["data"]["id"]
    # B acks delivery only (no read)
    rd = client.post(f"/api/messages/{mid}/delivered", headers=hb)
    assert rd.status_code == 200, rd.text
    ra = client.get(f"/api/conversations/{cid}/messages", headers=ha)
    mine = [m for m in ra.json()["data"]["messages"] if m["id"] == mid][0]
    assert mine["status"] == "delivered", mine
    # non-member cannot ack
    c = f"dc{s}"
    signup_user(c, f"{c}@ex.com", "Outsider")
    hc = _login(c)
    r_forbidden = client.post(f"/api/messages/{mid}/delivered", headers=hc)
    assert r_forbidden.status_code == 403


def test_e2ee_envelope_and_keys():
    import base64
    import time

    s = str(int(time.time() * 1000))[-6:]
    a = f"ea{s}"
    b = f"eb{s}"
    signup_user(a, f"{a}@ex.com", "E2E A")
    signup_user(b, f"{b}@ex.com", "E2E B")
    ha, hb = _login(a), _login(b)
    # publish a device key
    pub = base64.b64encode(b"A" * 32).decode()
    r = client.patch("/api/users/me/keys", json={"identity_pubkey": pub}, headers=ha)
    assert r.status_code == 200, r.text
    # malformed key rejected
    r_bad = client.patch(
        "/api/users/me/keys", json={"identity_pubkey": "nope"}, headers=ha
    )
    assert r_bad.status_code == 400
    # peer can fetch it; unknown key -> 404
    me = client.get("/api/auth/me", headers=ha).json()["data"]
    rk = client.get(f"/api/users/keys/{me['id']}", headers=hb)
    assert rk.status_code == 200 and rk.json()["data"]["identity_pubkey"] == pub
    me_b = client.get("/api/auth/me", headers=hb).json()["data"]
    assert client.get(f"/api/users/keys/{me_b['id']}", headers=ha).status_code == 404
    # 1-1 conversation + valid encrypted envelope
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    box = base64.b64encode(b"C" * 48).decode()
    nonce = base64.b64encode(b"N" * 24).decode()
    rm = client.post(
        f"/api/conversations/{cid}/messages",
        json={
            "content": box,
            "message_type": "text",
            "is_encrypted": True,
            "nonce": nonce,
        },
        headers=ha,
    )
    assert rm.status_code == 200, rm.text
    assert rm.json()["data"]["is_encrypted"] is True
    assert rm.json()["data"]["nonce"] == nonce
    # bad nonce rejected
    rb = client.post(
        f"/api/conversations/{cid}/messages",
        json={
            "content": box,
            "message_type": "text",
            "is_encrypted": True,
            "nonce": "short",
        },
        headers=ha,
    )
    assert rb.status_code == 400
    # groups reject encrypted
    rg = client.post(
        "/api/conversations",
        json={"is_group": True, "title": "Enc Group", "member_usernames": [b]},
        headers=ha,
    )
    gid = rg.json()["data"]["id"]
    rgg = client.post(
        f"/api/conversations/{gid}/messages",
        json={
            "content": box,
            "message_type": "text",
            "is_encrypted": True,
            "nonce": nonce,
        },
        headers=ha,
    )
    assert rgg.status_code == 400


def test_call_missed_posts_system_note():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a = f"ca{s}"
    b = f"cb{s}"
    signup_user(a, f"{a}@ex.com", "Call A")
    signup_user(b, f"{b}@ex.com", "Call B")
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    me_b = client.get("/api/auth/me", headers=hb).json()["data"]
    rs = client.post(
        "/api/calls/start",
        json={"callee_id": me_b["id"], "conversation_id": cid, "call_type": "voice"},
        headers=ha,
    )
    assert rs.status_code == 200, rs.text
    call_id = rs.json()["data"]["id"]
    # callee never answers; caller hangs up as missed
    re_ = client.post(
        f"/api/calls/{call_id}/end", json={"status": "missed"}, headers=ha
    )
    assert re_.status_code == 200, re_.text
    assert re_.json()["data"]["status"] == "missed"
    # a visible system note lands in the chat
    rl = client.get(f"/api/conversations/{cid}/messages", headers=ha)
    notes = [
        m
        for m in rl.json()["data"]["messages"]
        if m.get("message_type") == "system" and "Missed" in (m.get("content") or "")
    ]
    assert len(notes) == 1, rl.text


def test_google_auth_new_existing_and_reject(monkeypatch):
    import app.api.auth as authmod
    from app.database.config import settings

    payload = {
        "email": "GNew@Example.com",
        "name": "G New",
        "picture": "http://x/p.png",
        "sub": "g123",
        "aud": "test-client-id",
    }

    class FakeResp:
        status_code = 200

        def json(self):
            return payload

    class BadResp:
        status_code = 400

        def json(self):
            return {"error": "invalid_token"}

    old = settings.GOOGLE_CLIENT_ID
    settings.GOOGLE_CLIENT_ID = "test-client-id"
    monkeypatch.setattr(authmod.httpx, "get", lambda *a, **k: FakeResp())
    try:
        # NEW google user -> account created + session
        r = client.post("/api/auth/google", json={"credential": "tok"})
        assert r.status_code == 200, r.text
        uid = r.json()["data"]["user"]["id"]
        assert r.json()["data"]["access_token"]
        # EXISTING google user -> same account, no duplicate
        r2 = client.post("/api/auth/google", json={"credential": "tok"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["data"]["user"]["id"] == uid
        # session works like password login
        me = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {r2.json()['data']['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json()["data"]["id"] == uid
        # bad token -> clean 401 with reason
        monkeypatch.setattr(authmod.httpx, "get", lambda *a, **k: BadResp())
        r3 = client.post("/api/auth/google", json={"credential": "bad"})
        assert r3.status_code == 401, r3.text
    finally:
        settings.GOOGLE_CLIENT_ID = old
