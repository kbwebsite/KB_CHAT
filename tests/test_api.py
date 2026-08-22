import pytest
from fastapi.testclient import TestClient
import os
import sys
# Ensure backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../backend'))

from app.main import app
from app.database.connection import SessionLocal, create_tables, Base, engine

# Use test DB
# Override to in-memory? Use sqlite file for tests
create_tables()
client = TestClient(app)

def signup_user(username, email, display_name, password="password123"):
    return client.post("/api/auth/signup", json={
        "username": username,
        "email": email,
        "display_name": display_name,
        "password": password,
        "confirm_password": password
    })

def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["success"] == True

def test_signup_and_login():
    # unique suffix
    import time
    suffix = str(int(time.time()*1000))[-6:]
    u = f"testuser{suffix}"
    e = f"test{suffix}@example.com"
    r = signup_user(u, e, "Test User")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] == True
    token = data["data"]["access_token"]
    assert token

    # login with username
    r2 = client.post("/api/auth/login", json={"identifier": u, "password": "password123"})
    assert r2.status_code == 200
    assert r2.json()["success"] == True

    # me
    r3 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert r3.json()["data"]["username"] == u.lower()

def test_user_search_and_conversation_flow():
    import time
    s = str(int(time.time()*1000))[-6:]
    # create two users
    a = f"alice{s}"
    b = f"bob{s}"
    signup_user(a, f"{a}@ex.com", "Alice")
    signup_user(b, f"{b}@ex.com", "Bob")
    # login as alice
    r = client.post("/api/auth/login", json={"identifier": a, "password": "password123"})
    token_a = r.json()["data"]["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    # search for bob
    r2 = client.get(f"/api/users/search?q={b}", headers=headers_a)
    assert r2.status_code == 200
    assert any(u["username"]==b.lower() for u in r2.json()["data"])

    # create conversation
    r3 = client.post("/api/conversations", json={"participant_username": b}, headers=headers_a)
    assert r3.status_code == 200, r3.text
    conv_id = r3.json()["data"]["id"]

    # send message
    r4 = client.post(f"/api/conversations/{conv_id}/messages", json={"content": "Hello!"}, headers=headers_a)
    assert r4.status_code == 200, r4.text
    assert r4.json()["data"]["content"] == "Hello!"

    # list messages
    r5 = client.get(f"/api/conversations/{conv_id}/messages", headers=headers_a)
    assert r5.status_code == 200
    assert len(r5.json()["data"]["messages"]) >= 1

    # login as bob and check he can see message
    r6 = client.post("/api/auth/login", json={"identifier": b, "password": "password123"})
    token_b = r6.json()["data"]["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    r7 = client.get(f"/api/conversations/{conv_id}/messages", headers=headers_b)
    assert r7.status_code == 200
    assert any(m["content"]=="Hello!" for m in r7.json()["data"]["messages"])

    # bob replies
    r8 = client.post(f"/api/conversations/{conv_id}/messages", json={"content": "Hi Alice!"}, headers=headers_b)
    assert r8.status_code == 200

    # alice sees reply
    r9 = client.get(f"/api/conversations/{conv_id}/messages", headers=headers_a)
    assert any(m["content"]=="Hi Alice!" for m in r9.json()["data"]["messages"])

def test_message_edit_delete():
    import time
    s = str(int(time.time()*1000))[-5:]
    u = f"edituser{s}"
    signup_user(u, f"{u}@ex.com", "Edit User")
    r = client.post("/api/auth/login", json={"identifier": u, "password": "password123"})
    token = r.json()["data"]["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    # create self? need second user
    u2 = f"editbuddy{s}"
    signup_user(u2, f"{u2}@ex.com", "Buddy")
    r2 = client.post("/api/conversations", json={"participant_username": u2}, headers=h)
    cid = r2.json()["data"]["id"]
    # send
    r3 = client.post(f"/api/conversations/{cid}/messages", json={"content": "original"}, headers=h)
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
    s = str(int(time.time()*1000))[-5:]
    owner = f"owner{s}"
    m1 = f"member1{s}"
    m2 = f"member2{s}"
    signup_user(owner, f"{owner}@ex.com", "Owner")
    signup_user(m1, f"{m1}@ex.com", "M1")
    signup_user(m2, f"{m2}@ex.com", "M2")
    r = client.post("/api/auth/login", json={"identifier": owner, "password": "password123"})
    token = r.json()["data"]["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    r2 = client.post("/api/conversations", json={"is_group": True, "title": "Test Group", "member_usernames": [m1, m2]}, headers=h)
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["is_group"] == True
    assert len(r2.json()["data"]["members"]) == 3

def test_file_validation_unit():
    from app.utils.helpers import validate_file
    ok,_ = validate_file("test.jpg", "image/jpeg", 1024, 15)
    assert ok == True
    ok2,msg = validate_file("evil.exe", "application/octet-stream", 1024, 15)
    assert ok2 == False
    ok3,msg = validate_file("big.pdf", "application/pdf", 20*1024*1024, 15)
    assert ok3 == False
