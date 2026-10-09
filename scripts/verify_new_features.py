import hashlib, os, sys, time
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))
from fastapi.testclient import TestClient
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


sfx = str(int(time.time()))[-5:]
owner = f"own{sfx}"
m1 = f"mem1{sfx}"
_signup(owner, f"{owner}@ex.com")
_signup(m1, f"{m1}@ex.com")
ho = {"Authorization": f"Bearer {_token(owner)}"}
h1 = {"Authorization": f"Bearer {_token(m1)}"}
r = client.post(
    "/api/conversations",
    json={"is_group": True, "title": "AnnGrp", "member_usernames": [m1]},
    headers=ho,
)
assert r.status_code == 200, r.text
gid = r.json()["data"]["id"]
ids = {m["username"]: m["user_id"] for m in r.json()["data"]["members"]}
print("group", gid, ids)
r = client.patch(
    f"/api/conversations/groups/{gid}", json={"only_admins_can_send": True}, headers=ho
)
assert r.status_code == 200, r.text
assert r.json()["data"]["only_admins_can_send"] == True
print("announce ON ok")
r = client.post(
    f"/api/conversations/{gid}/messages", json={"content": "hi"}, headers=h1
)
print("member send status (expect 403):", r.status_code)
assert r.status_code == 403, r.text
r = client.post(
    f"/api/conversations/{gid}/messages", json={"content": "admin msg"}, headers=ho
)
assert r.status_code == 200, r.text
print("owner send ok")
r = client.patch(
    f"/api/conversations/groups/{gid}", json={"only_admins_can_send": False}, headers=h1
)
print("member toggle (expect 403):", r.status_code)
assert r.status_code == 403, r.text
r = client.post(
    f"/api/conversations/groups/{gid}/transfer", json={"user_id": ids[m1]}, headers=ho
)
assert r.status_code == 200, r.text
print("transfer ok:", r.json()["message"])
r = client.post(
    f"/api/conversations/groups/{gid}/transfer",
    json={"user_id": ids[owner]},
    headers=ho,
)
print("old-owner re-transfer (expect 403):", r.status_code)
assert r.status_code == 403, r.text
r = client.patch(
    f"/api/conversations/groups/{gid}", json={"only_admins_can_send": False}, headers=h1
)
assert r.status_code == 200, r.text
print("announce OFF by new owner ok")
r = client.post("/api/channels", json={"name": "TestCh" + sfx}, headers=ho)
assert r.status_code == 200, r.text
cid = r.json()["data"]["id"]
r = client.post(f"/api/channels/{cid}/posts", json={"content": "hello"}, headers=ho)
assert r.status_code == 200, r.text
pid = r.json()["data"]["id"]
print("channel post", cid, pid)
r = client.delete(f"/api/channels/{cid}/posts/{pid}", headers=h1)
print("non-owner delete (expect 403):", r.status_code)
assert r.status_code == 403, r.text
r = client.delete(f"/api/channels/{cid}/posts/{pid}", headers=ho)
assert r.status_code == 200, r.text
print("owner delete ok")
print("ALL NEW FEATURE CHECKS PASSED")
