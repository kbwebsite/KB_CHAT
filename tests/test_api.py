import pytest
from fastapi.testclient import TestClient
import os
import sys

# Ensure backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.main import app
from app.database.connection import SessionLocal, create_tables, Base, engine
from app.models.user import User

# Use test DB
# Override to in-memory? Use sqlite file for tests
create_tables()
client = TestClient(app)


def _mark_verified(email):
    # Fixture state: these tests exercise post-auth features, so treat the
    # inbox as already verified (the login gate itself is covered in
    # test_email_verification.py).
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(email=email.lower()).first()
        if u is not None and not u.email_verified:
            u.email_verified = True
            db.commit()
    finally:
        db.close()


def signup_user(username, email, display_name, password="password123"):
    r = client.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": display_name,
            "password": password,
            "confirm_password": password,
        },
    )
    _mark_verified(email)
    return r


def _login_token(identifier, password="password123"):
    """Password login through the every-sign-in code step. Returns a token."""
    import hashlib
    from datetime import datetime, timedelta, timezone

    from app.models.verification import VerificationCode

    r = client.post(
        "/api/auth/login", json={"identifier": identifier, "password": password}
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    if "access_token" in data:
        return data["access_token"]  # fail-open: no mail backend
    assert data.get("login_step") == "verify_code", data
    email = data["email"]
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=email).first()
        assert user is not None
        # Stale rows from earlier runs share the fixed test code hash.
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
    r2 = client.post(
        "/api/auth/verify-login", json={"email": email, "code": "123456"}
    )
    assert r2.status_code == 200, r2.text
    return r2.json()["data"]["access_token"]


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


def test_csp_allows_firebase_auth():
    # Google sign-in (popup/redirect) + phone reCAPTCHA load helpers from
    # Google hosts and relay through the Firebase auth-domain iframe; if CSP
    # blocks them the browser kills sign-in with auth/internal-error.
    r = client.get("/api/health")
    csp = r.headers.get("content-security-policy", "")
    script = [p for p in csp.split(";") if "script-src" in p][0]
    assert "https://apis.google.com" in script, csp
    assert "https://www.gstatic.com" in script, csp
    # phone auth's invisible reCAPTCHA loads api.js from www.google.com
    assert "https://www.google.com" in script, csp
    frame = [p for p in csp.split(";") if "frame-src" in p][0]
    assert "https://accounts.google.com" in frame, csp
    assert "firebaseapp.com" in frame, csp


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
    token_a = _login_token(a)
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
    token_b = _login_token(b)
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
    token = _login_token(u)
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
    token = _login_token(owner)
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
    return {"Authorization": f"Bearer {_login_token(username)}"}


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


def test_status_privacy_matrix():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b, c = f"pa{s}", f"pb{s}", f"pc{s}"
    for u in (a, b, c):
        signup_user(u, f"{u}@ex.com", u.upper())
    ha, hb, hc = _login(a), _login(b), _login(c)
    # A and B share a conversation; C is a stranger to A
    r = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    assert r.status_code == 200, r.text
    id_b = client.get("/api/auth/me", headers=hb).json()["data"]["id"]

    def mk(privacy, allowed=""):
        fd = {
            "content": f"priv-{privacy}-{s}",
            "media_type": "text",
            "privacy": privacy,
        }
        if allowed:
            fd["allowed_ids"] = allowed
        r = client.post("/api/status", data=fd, headers=ha)
        assert r.status_code == 200, r.text
        return r.json()["data"]["id"]

    mk("contacts")
    mk("nobody")
    mk("selected", allowed_ids := f"[{id_b}]")

    def visible(h):
        d = client.get("/api/status/feed", headers=h).json()["data"]
        return (
            {x["content"] for x in d["recent"]},
            {x["content"] for x in d["viewed"]},
            {x["content"] for x in d["my_status"]},
        )

    # stranger sees nothing of A's
    recent_c, viewed_c, _ = visible(hc)
    assert f"priv-contacts-{s}" not in recent_c | viewed_c
    assert f"priv-selected-{s}" not in recent_c | viewed_c
    assert f"priv-nobody-{s}" not in recent_c | viewed_c
    # contact sees contacts + selected, not nobody
    recent_b, _, _ = visible(hb)
    assert f"priv-contacts-{s}" in recent_b
    assert f"priv-selected-{s}" in recent_b
    assert f"priv-nobody-{s}" not in recent_b
    # owner sees everything
    _, _, mine_a = visible(ha)
    assert {f"priv-contacts-{s}", f"priv-nobody-{s}", f"priv-selected-{s}"} <= mine_a


def test_ai_action_shapes_carry_provider():
    import time

    s = str(int(time.time() * 1000))[-6:]
    u = f"aix{s}"
    signup_user(u, f"{u}@ex.com", "AIX")
    h = _login(u)
    r1 = client.post("/api/ai/summarize", json={"message": "hello world"}, headers=h)
    assert r1.status_code == 200 and "provider" in r1.json()["data"], r1.text
    r2 = client.post(
        "/api/ai/translate",
        json={"message": "hello", "target_language": "Spanish"},
        headers=h,
    )
    assert r2.status_code == 200 and "provider" in r2.json()["data"], r2.text
    r3 = client.post(
        "/api/ai/action",
        json={"code": "x=1", "language": "python", "action": "explain"},
        headers=h,
    )
    assert r3.status_code == 200 and "provider" in r3.json()["data"], r3.text


def test_link_preview_rejects_private_targets():
    import time

    s = str(int(time.time() * 1000))[-6:]
    u = f"ssrf{s}"
    signup_user(u, f"{u}@ex.com", "SSRF")
    h = _login(u)
    for bad in [
        "http://127.0.0.1/admin",
        "http://localhost:8000/",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "ftp://example.com/x",
        "not a url",
    ]:
        r = client.post("/api/link-preview", json={"url": bad}, headers=h)
        assert r.status_code == 400, (bad, r.text)


def test_rate_limiter_uses_forwarded_ip_and_buckets():
    from app.main import _client_ip, _rate_limit_hit, _request_counts

    class FakeClient:
        host = "10.9.9.9"

    class FakeReq:
        client = FakeClient()
        headers = {"x-forwarded-for": "203.0.113.7, 10.9.9.9"}

    assert _client_ip(FakeReq()) == "203.0.113.7"

    class FakeReq2:
        client = FakeClient()
        headers = {}

    assert _client_ip(FakeReq2()) == "10.9.9.9"
    _request_counts.clear()
    assert _rate_limit_hit("1.2.3.4", "t", 1000.0, 60, 2) is False
    assert _rate_limit_hit("1.2.3.4", "t", 1001.0, 60, 2) is False
    assert _rate_limit_hit("1.2.3.4", "t", 1002.0, 60, 2) is True
    # window expiry + per-scope isolation
    assert _rate_limit_hit("1.2.3.4", "t", 1070.0, 60, 2) is False
    assert _rate_limit_hit("1.2.3.4", "other", 1070.0, 60, 2) is False
    _request_counts.clear()


def test_clear_chat_hides_for_me_only():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"cla{s}", f"clb{s}"
    signup_user(a, f"{a}@ex.com", "Clear A")
    signup_user(b, f"{b}@ex.com", "Clear B")
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    client.post(
        f"/api/conversations/{cid}/messages", json={"content": "m1"}, headers=ha
    )
    client.post(
        f"/api/conversations/{cid}/messages", json={"content": "m2"}, headers=hb
    )
    # A clears: hidden for A, untouched for B, nothing deleted
    r = client.post(f"/api/conversations/{cid}/clear", headers=ha)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["cleared_before_id"] >= 2
    ra = client.get(f"/api/conversations/{cid}/messages", headers=ha)
    assert ra.json()["data"]["messages"] == []
    rb = client.get(f"/api/conversations/{cid}/messages", headers=hb)
    assert len(rb.json()["data"]["messages"]) == 2
    # A's conversation preview shows no last message and no unread
    ca = client.get("/api/conversations", headers=ha).json()["data"]
    mine = [c for c in ca if c["id"] == cid][0]
    assert mine["last_message"] is None
    assert mine["unread_count"] == 0
    # new messages after clear are visible to A again
    client.post(
        f"/api/conversations/{cid}/messages", json={"content": "m3"}, headers=hb
    )
    ra2 = client.get(f"/api/conversations/{cid}/messages", headers=ha)
    assert [m["content"] for m in ra2.json()["data"]["messages"]] == ["m3"]


def test_block_flow():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b, c, d = f"ba{s}", f"bb{s}", f"bc{s}", f"bd{s}"
    for u in (a, b, c, d):
        signup_user(u, f"{u}@ex.com", u.upper())
    ha, hb, hc, hd = _login(a), _login(b), _login(c), _login(d)
    # self-block and unknown user
    assert client.post("/api/contacts/999999/block", headers=ha).status_code == 404
    me_a = client.get("/api/auth/me", headers=ha).json()["data"]
    assert (
        client.post(f"/api/contacts/{me_a['id']}/block", headers=ha).status_code == 400
    )
    # conv first, then block: sending is refused both directions
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    me_b = client.get("/api/auth/me", headers=hb).json()["data"]
    rb = client.post(f"/api/contacts/{me_b['id']}/block", headers=ha)
    assert rb.status_code == 200, rb.text
    rl = client.get("/api/contacts/blocked", headers=ha).json()["data"]
    assert any(x["user_id"] == me_b["id"] for x in rl)
    r1 = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "x"}, headers=ha
    )
    assert r1.status_code == 403
    r2 = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "y"}, headers=hb
    )
    assert r2.status_code == 403
    # blocked chat hidden from blocker's list
    ca = client.get("/api/conversations", headers=ha).json()["data"]
    assert all(cc["id"] != cid for cc in ca)
    # no new chats with blocked users
    rn = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    assert rn.status_code == 403
    # unblock restores everything
    ru = client.post(f"/api/contacts/{me_b['id']}/unblock", headers=ha)
    assert ru.status_code == 200
    r3 = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "z"}, headers=ha
    )
    assert r3.status_code == 200, r3.text
    # untouched pair can still chat
    rc2 = client.post(
        "/api/conversations", json={"participant_username": d}, headers=hc
    )
    assert rc2.status_code == 200, rc2.text


def test_ai_provider_mapping_and_endpoint_fallback():
    from app.ai.provider import (
        get_ai_provider,
        OpenAICompatibleProvider,
        ServiceProvider,
    )
    from app.database.config import settings

    old_provider, old_base = settings.AI_PROVIDER, settings.AI_BASE_URL
    try:
        for name, cls in [
            ("mock", ServiceProvider),
            ("", ServiceProvider),
            ("off", ServiceProvider),
            ("openai", OpenAICompatibleProvider),
            ("openai-compatible", OpenAICompatibleProvider),
            ("ollama", OpenAICompatibleProvider),
            ("custom", OpenAICompatibleProvider),
        ]:
            settings.AI_PROVIDER = name
            assert isinstance(get_ai_provider(), cls), name
        # endpoint candidates adapt to the configured base
        settings.AI_BASE_URL = "https://api.openai.com/v1"
        assert OpenAICompatibleProvider()._candidate_urls() == [
            "https://api.openai.com/v1/chat/completions"
        ]
        settings.AI_BASE_URL = "https://ollama.com"
        assert OpenAICompatibleProvider()._candidate_urls() == [
            "https://ollama.com/chat/completions",
            "https://ollama.com/v1/chat/completions",
        ]
    finally:
        settings.AI_PROVIDER, settings.AI_BASE_URL = old_provider, old_base


def test_firebase_exchange_new_existing_unverified_rejected(monkeypatch):
    import app.api.auth as authmod

    calls = {"n": 0}

    def fake_verify(token):
        calls["n"] += 1
        if token == "good-google":
            return {
                "uid": "fb_google_1",
                "email": "FireNew@Example.com",
                "name": "Fire New",
                "picture": "http://x/p.png",
                "email_verified": True,
                "firebase": {"sign_in_provider": "google.com"},
            }
        if token == "good-unverified":
            return {
                "uid": "fb_pw_1",
                "email": "squat@example.com",
                "email_verified": False,
                "firebase": {"sign_in_provider": "password"},
            }
        raise Exception("bad token")

    monkeypatch.setattr(authmod, "_firebase_app_or_503", lambda: True)
    import firebase_admin.auth as fb_auth_mod

    monkeypatch.setattr(fb_auth_mod, "verify_id_token", fake_verify)

    # new Firebase user -> created
    r = client.post("/api/auth/firebase", json={"id_token": "good-google"})
    assert r.status_code == 200, r.text
    uid = r.json()["data"]["user"]["id"]
    assert r.json()["data"]["user"]["email"] == "firenew@example.com"
    # same token again -> same user, no duplicate
    r2 = client.post("/api/auth/firebase", json={"id_token": "good-google"})
    assert r2.json()["data"]["user"]["id"] == uid
    assert calls["n"] == 2
    # unverified password account cannot squat
    r3 = client.post("/api/auth/firebase", json={"id_token": "good-unverified"})
    assert r3.status_code == 401, r3.text
    # garbage token rejected; missing token rejected
    assert (
        client.post("/api/auth/firebase", json={"id_token": "nope"}).status_code == 401
    )
    assert client.post("/api/auth/firebase", json={}).status_code == 400
    # phone user (no email) gets a deterministic placeholder identity
    from app.api.auth import _get_or_create_phone_user
    from app.database.connection import SessionLocal

    db = SessionLocal()
    try:
        u1 = _get_or_create_phone_user(
            db, fb_uid="AbC123xYz", phone="+919876543210", name=None
        )
        u2 = _get_or_create_phone_user(
            db, fb_uid="AbC123xYz", phone="+919876543210", name=None
        )
        assert u1.id == u2.id
        assert u1.email == "phone-abc123xyz@phone.local"
    finally:
        db.close()


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
        "email_verified": True,
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

        # unverified Google inbox -> no session (same rule as native email)
        class UnverifiedResp:
            status_code = 200

            def json(self):
                return {**payload, "email_verified": False}

        monkeypatch.setattr(authmod.httpx, "get", lambda *a, **k: UnverifiedResp())
        r4 = client.post("/api/auth/google", json={"credential": "tok"})
        assert r4.status_code == 401, r4.text
    finally:
        settings.GOOGLE_CLIENT_ID = old


def test_forgot_password_hides_token_in_production():
    # SECURITY: with no email sender wired up, returning the live reset token
    # lets anyone take over any account. Production must not disclose it.
    import time

    from app.database.config import settings

    suffix = str(int(time.time() * 1000))[-6:]
    e = f"resetprod{suffix}@example.com"
    r = signup_user(f"resetprod{suffix}", e, "Reset Prod")
    assert r.status_code == 200, r.text

    old = settings.APP_ENV
    settings.APP_ENV = "production"
    try:
        r2 = client.post("/api/auth/forgot-password", json={"email": e})
        assert r2.status_code == 200, r2.text
        assert r2.json()["data"] is None, r2.text
    finally:
        settings.APP_ENV = old


def test_forgot_password_dev_returns_token_and_resets():  # Dev keeps the token-in-response flow so local testing still works, and
    # a consumed token cannot be reused.
    import time

    from app.database.config import settings

    suffix = str(int(time.time() * 1000))[-6:]
    e = f"resetdev{suffix}@example.com"
    r = signup_user(f"resetdev{suffix}", e, "Reset Dev")
    assert r.status_code == 200, r.text

    old = settings.APP_ENV
    settings.APP_ENV = "development"
    try:
        r2 = client.post("/api/auth/forgot-password", json={"email": e})
        assert r2.status_code == 200, r2.text
        token = (r2.json()["data"] or {}).get("token")
        assert token, r2.text

        r3 = client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "newpass123"},
        )
        assert r3.status_code == 200, r3.text

        # single-use: replay must fail
        r4 = client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "newpass123"},
        )
        assert r4.status_code == 400, r4.text

        # login with the new password works
        r5 = client.post(
            "/api/auth/login", json={"identifier": e, "password": "newpass123"}
        )
        assert r5.status_code == 200, r5.text
    finally:
        settings.APP_ENV = old


@pytest.mark.asyncio
async def test_ws_send_to_hanging_socket_times_out_and_reaps():  # A half-dead (e.g. mobile-network) socket can block send_text for tens of
    # seconds on TCP retransmits. Fan-out must time out and reap it instead of
    # stalling every broadcast (and every awaited read path) behind it.
    import asyncio
    import time

    from app.websocket.manager import manager

    class HangingWS:
        async def send_text(self, text):
            await asyncio.sleep(30)

    ws = HangingWS()
    manager.user_connections[999999].add(ws)
    try:
        start = time.monotonic()
        await manager.send_to_user(999999, {"type": "x", "payload": {}})
        elapsed = time.monotonic() - start
        assert elapsed < 20, elapsed
        assert ws not in manager.user_connections.get(999999, set())
    finally:
        manager.user_connections.pop(999999, None)


def test_ai_chat_stream_emits_tokens_final_and_done():
    # SSE contract for the KB AI page: token event(s), a final event with the
    # complete text, then [DONE]. Uses the mock provider in tests.
    import time

    suffix = str(int(time.time() * 1000))[-6:]
    e = f"aistream{suffix}@example.com"
    r = signup_user(f"aistream{suffix}", e, "AI Stream")
    assert r.status_code == 200, r.text
    token = r.json()["data"]["access_token"]

    r2 = client.post(
        "/api/ai/chat/stream",
        json={"message": "How do I create a group?", "history": []},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 200, r2.text
    body = r2.text
    assert "data: [DONE]" in body, body
    assert '"type": "token"' in body, body
    assert '"type": "final"' in body, body
    assert "Creating a Group Chat" in body, body


def test_ai_chat_stream_requires_auth():
    r = client.post("/api/ai/chat/stream", json={"message": "hi"})
    assert r.status_code in (401, 403), r.text


def test_encrypted_preview_masked_in_conversation_list():
    # E2EE ciphertext must never leak into chat-list previews, but the full
    # envelope must still reach history so devices can open it.
    import base64
    import os
    import time

    s = str(int(time.time() * 1000))[-6:]
    a = f"enca{s}"
    b = f"encb{s}"
    signup_user(a, f"{a}@ex.com", "Enc A")
    signup_user(b, f"{b}@ex.com", "Enc B")
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    assert rc.status_code == 200, rc.text
    cid = rc.json()["data"]["id"]

    content = base64.b64encode(os.urandom(40)).decode()
    nonce = base64.b64encode(os.urandom(24)).decode()
    r1 = client.post(
        f"/api/conversations/{cid}/messages",
        json={"content": content, "nonce": nonce, "is_encrypted": True},
        headers=ha,
    )
    assert r1.status_code == 200, r1.text

    rl = client.get("/api/conversations", headers=ha)
    assert rl.status_code == 200, rl.text
    conv = [c for c in rl.json()["data"] if c["id"] == cid][0]
    assert conv["last_message"]["content"] == "🔒 Encrypted message", conv[
        "last_message"
    ]

    rh = client.get(f"/api/conversations/{cid}/messages", headers=hb)
    assert rh.status_code == 200, rh.text
    m = [m for m in rh.json()["data"]["messages"] if m["content"] == content][0]
    assert m["is_encrypted"] is True
    assert m["nonce"] == nonce


def test_get_user_by_username_returns_profile():
    # Regression: wrong variable name 500'd every lookup.
    import time

    s = str(int(time.time() * 1000))[-6:]
    u = f"lookup{s}"
    signup_user(u, f"{u}@ex.com", "Lookup User")
    h = _login(u)
    r = client.get(f"/api/users/{u}", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["username"] == u
    assert "last_seen" in r.json()["data"]


def test_status_view_enforces_privacy():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b, c = f"sva{s}", f"svb{s}", f"svc{s}"
    for u in (a, b, c):
        signup_user(u, f"{u}@ex.com", u.upper())
    ha, hb, hc = _login(a), _login(b), _login(c)
    # A and B share a conversation; C is a stranger to A
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    assert rc.status_code == 200, rc.text
    id_b = client.get("/api/auth/me", headers=hb).json()["data"]["id"]

    def mk(privacy, allowed=""):
        fd = {
            "content": f"sv-{privacy}-{s}",
            "media_type": "text",
            "privacy": privacy,
        }
        if allowed:
            fd["allowed_ids"] = allowed
        r = client.post("/api/status", data=fd, headers=ha)
        assert r.status_code == 200, r.text
        return r.json()["data"]["id"]

    sid_contacts = mk("contacts")
    sid_nobody = mk("nobody")
    sid_selected = mk("selected", f"[{id_b}]")

    # stranger sees none of them (404: no existence leak, no viewer row)
    for sid in (sid_contacts, sid_nobody, sid_selected):
        r = client.post(f"/api/status/{sid}/view", headers=hc)
        assert r.status_code == 404, (sid, r.text)
    # contact sees contacts + selected, not nobody
    assert (
        client.post(f"/api/status/{sid_contacts}/view", headers=hb).status_code == 200
    )
    assert (
        client.post(f"/api/status/{sid_selected}/view", headers=hb).status_code == 200
    )
    assert client.post(f"/api/status/{sid_nobody}/view", headers=hb).status_code == 404
    # owner always can
    assert client.post(f"/api/status/{sid_nobody}/view", headers=ha).status_code == 200


def test_call_accept_transitions_and_end_coerces():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"ac{s}", f"bc{s}"
    signup_user(a, f"{a}@ex.com", "Accept A")
    signup_user(b, f"{b}@ex.com", "Accept B")
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    me_b = client.get("/api/auth/me", headers=hb).json()["data"]
    rs = client.post(
        "/api/calls/start",
        json={"callee_id": me_b["id"], "conversation_id": cid, "call_type": "voice"},
        headers=ha,
    )
    call_id = rs.json()["data"]["id"]
    ra = client.post(f"/api/calls/{call_id}/accept", headers=hb)
    assert ra.status_code == 200, ra.text
    # callee (not caller) can accept; caller gets 403
    ra_bad = client.post(f"/api/calls/{call_id}/accept", headers=ha)
    assert ra_bad.status_code == 403, ra_bad.text
    re_ = client.post(f"/api/calls/{call_id}/end", json={"status": "ended"}, headers=ha)
    assert re_.json()["data"]["status"] == "ended"


def test_call_start_rejects_unknown_callee_and_outsider():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b, c = f"cs{s}", f"ct{s}", f"co{s}"
    for u in (a, b, c):
        signup_user(u, f"{u}@ex.com", u.upper())
    ha, hb, hc = _login(a), _login(b), _login(c)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    r1 = client.post(
        "/api/calls/start",
        json={"callee_id": 999999999, "conversation_id": cid},
        headers=ha,
    )
    assert r1.status_code == 404, r1.text
    me_c = client.get("/api/auth/me", headers=hc).json()["data"]
    r2 = client.post(
        "/api/calls/start",
        json={"callee_id": me_c["id"], "conversation_id": cid},
        headers=ha,
    )
    assert r2.status_code == 403, r2.text


def test_scheduled_update_rejects_past_and_naive_ok():
    import time
    from datetime import datetime, timedelta, timezone

    s = str(int(time.time() * 1000))[-6:]
    u = f"sch{s}"
    signup_user(u, f"{u}@ex.com", "Sched")
    h = _login(u)
    v = f"schv{s}"
    signup_user(v, f"{v}@ex.com", "Sched V")
    rc = client.post("/api/conversations", json={"participant_username": v}, headers=h)
    assert rc.status_code == 200, rc.text
    cid = rc.json()["data"]["id"]

    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    r1 = client.post(
        f"/api/conversations/{cid}/scheduled",
        json={"content": "later", "scheduled_at": future},
        headers=h,
    )
    assert r1.status_code == 200, r1.text
    sm_id = r1.json()["data"]["id"]
    # naive datetime must not 500 (assumed UTC)
    naive = (
        (datetime.now(timezone.utc) + timedelta(hours=3))
        .replace(tzinfo=None)
        .isoformat()
    )
    r2 = client.post(
        f"/api/conversations/{cid}/scheduled",
        json={"content": "naive", "scheduled_at": naive},
        headers=h,
    )
    assert r2.status_code == 200, r2.text
    # moving to the past is rejected
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    r3 = client.patch(f"/api/scheduled/{sm_id}", json={"scheduled_at": past}, headers=h)
    assert r3.status_code == 400, r3.text


def test_event_rejects_unparseable_date():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"ev{s}", f"evb{s}"
    signup_user(a, f"{a}@ex.com", "Ev A")
    signup_user(b, f"{b}@ex.com", "Ev B")
    ha = _login(a)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    r = client.post(
        f"/api/conversations/{cid}/events",
        json={"title": "Party", "event_date": "not-a-date"},
        headers=ha,
    )
    assert r.status_code == 400, r.text


def test_sticker_use_rejects_unknown_id():
    import time

    s = str(int(time.time() * 1000))[-6:]
    u = f"st{s}"
    signup_user(u, f"{u}@ex.com", "Sticker")
    h = _login(u)
    r1 = client.post("/api/stickers/999999999/use", headers=h)
    assert r1.status_code == 404, r1.text
    r2 = client.post("/api/stickers/999999999/favorite", headers=h)
    assert r2.status_code == 404, r2.text


def test_group_self_leave_and_owner_handoff():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"ga{s}", f"gb{s}"
    signup_user(a, f"{a}@ex.com", "GA")
    signup_user(b, f"{b}@ex.com", "GB")
    ha, hb = _login(a), _login(b)
    me_b = client.get("/api/auth/me", headers=hb).json()["data"]
    rg = client.post(
        "/api/groups", json={"title": f"g{s}", "member_ids": [me_b["id"]]}, headers=ha
    )
    assert rg.status_code == 200, rg.text
    gid = rg.json()["data"]["id"]
    # member can leave on their own (was 403)
    rl = client.delete(f"/api/groups/{gid}/members/{me_b['id']}", headers=hb)
    assert rl.status_code == 200, rl.text
    # owner self-leaves with nobody left -> group is gone, never ownerless
    me_a = client.get("/api/auth/me", headers=ha).json()["data"]
    rl2 = client.delete(f"/api/groups/{gid}/members/{me_a['id']}", headers=ha)
    assert rl2.status_code == 200, rl2.text
    rg2 = client.get(f"/api/conversations/{gid}", headers=ha)
    assert rg2.status_code in (403, 404), rg2.text


def test_group_owner_leave_promotes_member():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"pa{s}", f"pb{s}"
    signup_user(a, f"{a}@ex.com", "PA")
    signup_user(b, f"{b}@ex.com", "PB")
    ha, hb = _login(a), _login(b)
    me_b = client.get("/api/auth/me", headers=hb).json()["data"]
    rg = client.post(
        "/api/groups", json={"title": f"pg{s}", "member_ids": [me_b["id"]]}, headers=ha
    )
    gid = rg.json()["data"]["id"]
    me_a = client.get("/api/auth/me", headers=ha).json()["data"]
    rl = client.delete(f"/api/groups/{gid}/members/{me_a['id']}", headers=ha)
    assert rl.status_code == 200, rl.text
    # B (promoted) can now act as owner: add A back
    ra = client.post(
        f"/api/groups/{gid}/members", json={"member_ids": [me_a["id"]]}, headers=hb
    )
    assert ra.status_code == 200, ra.text


def test_polls_list_batched_shape():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"po{s}", f"pob{s}"
    signup_user(a, f"{a}@ex.com", "PO A")
    signup_user(b, f"{b}@ex.com", "PO B")
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    rp = client.post(
        f"/api/conversations/{cid}/polls",
        json={"question": "Lunch?", "options": ["Here", "There", "Else"]},
        headers=ha,
    )
    assert rp.status_code == 200, rp.text
    pid = rp.json()["data"]["id"]
    rl = client.get(f"/api/conversations/{cid}/polls", headers=hb)
    assert rl.status_code == 200, rl.text
    polls = rl.json()["data"]
    assert len(polls) == 1 and len(polls[0]["options"]) == 3, rl.text
    assert polls[0]["total_votes"] == 0
    rv = client.post(
        f"/api/polls/{pid}/vote",
        json={"option_ids": [polls[0]["options"][0]["id"]]},
        headers=hb,
    )
    assert rv.status_code == 200, rv.text
    rl2 = client.get(f"/api/conversations/{cid}/polls", headers=ha)
    assert rl2.json()["data"][0]["total_votes"] == 1, rl2.text


def test_view_once_full_cycle():
    # Send -> recipient sees only a shell everywhere -> explicit tap burns it
    # exactly once -> sender keeps their copy throughout.
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"vo{s}", f"vob{s}"
    signup_user(a, f"{a}@ex.com", "VO A")
    signup_user(b, f"{b}@ex.com", "VO B")
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]

    r1 = client.post(
        f"/api/conversations/{cid}/messages",
        json={"content": "shh-secret", "view_once": True},
        headers=ha,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["data"]["view_once"] is True
    mid = r1.json()["data"]["id"]

    # recipient history: shell, no plaintext, no nonce
    rb = client.get(f"/api/conversations/{cid}/messages", headers=hb)
    got = [m for m in rb.json()["data"]["messages"] if m["id"] == mid][0]
    assert got["content"] == "", got
    assert got["nonce"] is None, got
    assert got["view_once"] is True
    # sender history: full copy
    ra = client.get(f"/api/conversations/{cid}/messages", headers=ha)
    mine = [m for m in ra.json()["data"]["messages"] if m["id"] == mid][0]
    assert mine["content"] == "shh-secret", mine
    # previews: masked for recipient, full for sender
    cl_b = [
        c
        for c in client.get("/api/conversations", headers=hb).json()["data"]
        if c["id"] == cid
    ][0]
    assert cl_b["last_message"]["content"] == "👁 View-once message", cl_b[
        "last_message"
    ]
    cl_a = [
        c
        for c in client.get("/api/conversations", headers=ha).json()["data"]
        if c["id"] == cid
    ][0]
    assert cl_a["last_message"]["content"] == "shh-secret", cl_a["last_message"]

    # first tap burns it
    rv = client.post(f"/api/messages/{mid}/view-once", headers=hb)
    assert rv.status_code == 200, rv.text
    assert rv.json()["data"]["content"] == "shh-secret"
    # second tap is gone
    rv2 = client.post(f"/api/messages/{mid}/view-once", headers=hb)
    assert rv2.status_code == 410, rv2.text
    # history stays wiped for recipient; burn is global (WhatsApp-style), so
    # the sender's copy burns too and both previews read "Opened"
    rb2 = client.get(f"/api/conversations/{cid}/messages", headers=hb)
    got2 = [m for m in rb2.json()["data"]["messages"] if m["id"] == mid][0]
    assert got2["content"] == "", got2
    ra2 = client.get(f"/api/conversations/{cid}/messages", headers=ha)
    mine2 = [m for m in ra2.json()["data"]["messages"] if m["id"] == mid][0]
    assert mine2["content"] == "", mine2
    assert mine2["viewed_once"] is True
    cl_b2 = [
        c
        for c in client.get("/api/conversations", headers=hb).json()["data"]
        if c["id"] == cid
    ][0]
    assert cl_b2["last_message"]["content"] == "👁 Opened", cl_b2["last_message"]
    cl_a2 = [
        c
        for c in client.get("/api/conversations", headers=ha).json()["data"]
        if c["id"] == cid
    ][0]
    assert cl_a2["last_message"]["content"] == "👁 Opened", cl_a2["last_message"]


def test_view_once_rules_guards():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"vg{s}", f"vgb{s}"
    signup_user(a, f"{a}@ex.com", "VG A")
    signup_user(b, f"{b}@ex.com", "VG B")
    ha, hb = _login(a), _login(b)
    me_b = client.get("/api/auth/me", headers=hb).json()["data"]
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    rg = client.post(
        "/api/groups", json={"title": f"vg{s}", "member_ids": [me_b["id"]]}, headers=ha
    )
    gid = rg.json()["data"]["id"]

    # groups rejected
    r1 = client.post(
        f"/api/conversations/{gid}/messages",
        json={"content": "x", "view_once": True},
        headers=ha,
    )
    assert r1.status_code == 400, r1.text
    # attachments rejected
    r2 = client.post(
        f"/api/conversations/{cid}/messages",
        json={"content": "x", "view_once": True, "attachment_ids": [1]},
        headers=ha,
    )
    assert r2.status_code == 400, r2.text

    r3 = client.post(
        f"/api/conversations/{cid}/messages",
        json={"content": "burner", "view_once": True},
        headers=ha,
    )
    mid = r3.json()["data"]["id"]
    # sender tap does not burn
    rs = client.post(f"/api/messages/{mid}/view-once", headers=ha)
    assert rs.status_code == 200, rs.text
    assert rs.json()["data"]["content"] is None
    # edit / forward / pin all refused
    assert (
        client.patch(
            f"/api/messages/{mid}", json={"content": "nope"}, headers=ha
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"/api/messages/{mid}/forward", json={"conversation_ids": [cid]}, headers=ha
        ).status_code
        == 400
    )
    assert client.post(f"/api/messages/{mid}/pin", headers=ha).status_code == 400
    # non-view-once message through the tap endpoint is rejected
    r4 = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "plain"}, headers=ha
    )
    mid2 = r4.json()["data"]["id"]
    assert client.post(f"/api/messages/{mid2}/view-once", headers=hb).status_code == 400


def test_group_invite_lifecycle():
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b, c = f"ia{s}", f"ib{s}", f"ic{s}"
    for u in (a, b, c):
        signup_user(u, f"{u}@ex.com", u.upper())
    ha, hb, hc = _login(a), _login(b), _login(c)
    me_b = client.get("/api/auth/me", headers=hb).json()["data"]
    rg = client.post(
        "/api/groups", json={"title": f"ig{s}", "member_ids": [me_b["id"]]}, headers=ha
    )
    gid = rg.json()["data"]["id"]
    # member (not manager) cannot manage invites
    assert client.post(f"/api/groups/{gid}/invite", headers=hb).status_code == 403
    assert client.get(f"/api/groups/{gid}/invite", headers=hb).status_code == 403
    # owner creates a link
    r1 = client.post(f"/api/groups/{gid}/invite", headers=ha)
    assert r1.status_code == 200, r1.text
    token = r1.json()["data"]["invite_token"]
    assert token and len(token) >= 16
    # stranger joins through it
    rj = client.post(f"/api/groups/join/{token}", headers=hc)
    assert rj.status_code == 200, rj.text
    assert rj.json()["data"]["conversation_id"] == gid
    assert rj.json()["data"]["already_member"] is False
    # re-join is idempotent
    rj2 = client.post(f"/api/groups/join/{token}", headers=hc)
    assert rj2.json()["data"]["already_member"] is True
    # rotating invalidates the old link
    r3 = client.post(f"/api/groups/{gid}/invite", headers=ha)
    token2 = r3.json()["data"]["invite_token"]
    assert token2 != token
    assert client.post(f"/api/groups/join/{token}", headers=hb).status_code == 404
    # disabling kills the new link too
    rd = client.delete(f"/api/groups/{gid}/invite", headers=ha)
    assert rd.status_code == 200, rd.text
    assert client.post(f"/api/groups/join/{token2}", headers=hb).status_code == 404
    # garbage token
    assert client.post("/api/groups/join/nope", headers=hb).status_code == 404


def test_extras_single_call_shape():
    # One round trip serves polls + events + pinned for a chat open.
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"ex{s}", f"exb{s}"
    signup_user(a, f"{a}@ex.com", "EX A")
    signup_user(b, f"{b}@ex.com", "EX B")
    ha = _login(a)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]
    rp = client.post(
        f"/api/conversations/{cid}/polls",
        json={"question": "Go?", "options": ["Yes", "No"]},
        headers=ha,
    )
    assert rp.status_code == 200, rp.text
    rm = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "pin me"}, headers=ha
    )
    mid = rm.json()["data"]["id"]
    assert client.post(f"/api/messages/{mid}/pin", headers=ha).status_code == 200
    re_ = client.get(f"/api/conversations/{cid}/extras", headers=ha)
    assert re_.status_code == 200, re_.text
    data = re_.json()["data"]
    assert len(data["polls"]) == 1 and data["polls"][0]["question"] == "Go?"
    assert data["events"] == []
    assert len(data["pinned"]) == 1 and data["pinned"][0]["id"] == mid
    # Non-member gets 403, not data.
    s2 = str(int(time.time() * 1000))[-6:]
    c = f"exo{s2}"
    signup_user(c, f"{c}@ex.com", "EX O")
    ho = _login(c)
    assert client.get(f"/api/conversations/{cid}/extras", headers=ho).status_code == 403


def test_unread_clears_on_first_open_and_survives_refresh():
    # Acceptance: A sends -> B sees unread 1 -> B marks read once ->
    # unread 0 across refetches (no second open needed). A stale cursor
    # must not regress it; a genuinely new message re-arms the badge.
    import time

    s = str(int(time.time() * 1000))[-6:]
    a, b = f"ur{s}", f"urb{s}"
    signup_user(a, f"{a}@ex.com", "UR A")
    signup_user(b, f"{b}@ex.com", "UR B")
    ha, hb = _login(a), _login(b)
    rc = client.post("/api/conversations", json={"participant_username": b}, headers=ha)
    cid = rc.json()["data"]["id"]

    rm = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "hey B"}, headers=ha
    )
    assert rm.status_code == 200, rm.text
    mid = rm.json()["data"]["id"]

    def unread_of():
        rl = client.get("/api/conversations", headers=hb)
        assert rl.status_code == 200, rl.text
        conv = next(c for c in rl.json()["data"] if c["id"] == cid)
        return conv["unread_count"]

    assert unread_of() == 1
    # B opens the chat once: persist the read cursor.
    rr = client.post(
        f"/api/conversations/{cid}/read", json={"last_message_id": mid}, headers=hb
    )
    assert rr.status_code == 200, rr.text
    # Badge stays 0 across refetches (refresh / reconnect / second open).
    assert unread_of() == 0
    assert unread_of() == 0
    # Stale cursor must not regress the badge... or the cursor.
    ro = client.post(
        f"/api/conversations/{cid}/read", json={"last_message_id": mid - 1}, headers=hb
    )
    assert ro.status_code == 200, ro.text
    assert unread_of() == 0
    # A genuinely new message re-arms the badge.
    rm2 = client.post(
        f"/api/conversations/{cid}/messages", json={"content": "again"}, headers=ha
    )
    assert rm2.status_code == 200, rm2.text
    assert unread_of() == 1
