"""AI sticker maker packs: user-scoped pack CRUD + sticker adds.

Isolated (unique users per run, own packs only). Covers: create +
validation, list isolation (builtin visible, others' packs hidden),
add/auth/validation/cap, delete cascade + builtin immutability.
"""

import uuid

from fastapi.testclient import TestClient
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.main import app
from app.database.connection import SessionLocal, create_tables
from app.models.user import User

create_tables()
client = TestClient(app)

IMG = "https://image.pollinations.ai/prompt/cute-cat"


def _tag():
    return uuid.uuid4().hex[:8]


def signup():
    t = _tag()
    u, e = f"st{t}", f"st{t}@ex.com"
    r = client.post(
        "/api/auth/signup",
        json={
            "username": u,
            "email": e,
            "display_name": f"ST {t}",
            "password": "password123",
            "confirm_password": "password123",
        },
    )
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        usr = db.query(User).filter_by(email=e.lower()).first()
        if usr is not None and not usr.email_verified:
            usr.email_verified = True
            db.commit()
    finally:
        db.close()
    r = client.post(
        "/api/auth/login", json={"identifier": u, "password": "password123"}
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    if "access_token" in data:
        return {"Authorization": f"Bearer {data['access_token']}"}
    import hashlib
    from datetime import datetime, timedelta, timezone
    from app.models.verification import VerificationCode

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=e).first()
        db.query(VerificationCode).filter_by(
            code_hash=hashlib.sha256(b"123456").hexdigest()
        ).delete()
        db.add(
            VerificationCode(
                user_id=user.id,
                email=e,
                code_hash=hashlib.sha256(b"123456").hexdigest(),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
        )
        db.commit()
    finally:
        db.close()
    r2 = client.post("/api/auth/verify-login", json={"email": e, "code": "123456"})
    assert r2.status_code == 200, r2.text
    return {"Authorization": f"Bearer {r2.json()['data']['access_token']}"}


def test_create_pack_and_validation():
    h = signup()
    r = client.post("/api/sticker-packs", json={"name": "  My Pack  "}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    assert body["name"] == "My Pack"
    assert body["is_owner"] is True
    assert body["stickers"] == []
    r = client.post("/api/sticker-packs", json={"name": "   "}, headers=h)
    assert r.status_code == 400, r.text
    r = client.post("/api/sticker-packs", json={}, headers=h)
    assert r.status_code == 400, r.text


def test_list_shows_builtin_plus_own_only():
    h1 = signup()
    h2 = signup()
    r = client.post("/api/sticker-packs", json={"name": "Mine"}, headers=h1)
    pid = r.json()["data"]["id"]
    r = client.get("/api/sticker-packs", headers=h2)
    assert r.status_code == 200, r.text
    ids = [p["id"] for p in r.json()["data"]]
    assert pid not in ids
    assert any(p["is_builtin"] for p in r.json()["data"])
    r = client.get("/api/sticker-packs", headers=h1)
    mine = [p for p in r.json()["data"] if p["id"] == pid][0]
    assert mine["is_owner"] is True


def test_add_sticker_auth_and_validation():
    h1 = signup()
    h2 = signup()
    pid = client.post("/api/sticker-packs", json={"name": "P"}, headers=h1).json()[
        "data"
    ]["id"]
    # foreign pack masked as missing
    r = client.post(
        f"/api/sticker-packs/{pid}/stickers", json={"image_url": IMG}, headers=h2
    )
    assert r.status_code == 404, r.text
    r = client.post(
        "/api/sticker-packs/99999999/stickers", json={"image_url": IMG}, headers=h1
    )
    assert r.status_code == 404, r.text
    # bad urls rejected
    for bad in ["", "notaurl", "ftp://x/y.png", "x" * 501]:
        r = client.post(
            f"/api/sticker-packs/{pid}/stickers", json={"image_url": bad}, headers=h1
        )
        assert r.status_code == 400, r.text
    # good add lands with position 0 and emoji passthrough
    r = client.post(
        f"/api/sticker-packs/{pid}/stickers",
        json={"image_url": IMG, "emoji": "🐱"},
        headers=h1,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["image_url"] == IMG
    assert r.json()["data"]["emoji"] == "🐱"
    r = client.get("/api/sticker-packs", headers=h1)
    mine = [p for p in r.json()["data"] if p["id"] == pid][0]
    assert len(mine["stickers"]) == 1


def test_pack_cap():
    import app.api.stickers as smod

    old, smod.MAX_PACK_STICKERS = smod.MAX_PACK_STICKERS, 1
    try:
        h = signup()
        pid = client.post(
            "/api/sticker-packs", json={"name": "Tiny"}, headers=h
        ).json()["data"]["id"]
        r = client.post(
            f"/api/sticker-packs/{pid}/stickers",
            json={"image_url": IMG + "1"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        r = client.post(
            f"/api/sticker-packs/{pid}/stickers",
            json={"image_url": IMG + "2"},
            headers=h,
        )
        assert r.status_code == 400, r.text
    finally:
        smod.MAX_PACK_STICKERS = old


def test_delete_pack_and_builtin_immutable():
    h = signup()
    pid = client.post("/api/sticker-packs", json={"name": "Gone"}, headers=h).json()[
        "data"
    ]["id"]
    client.post(
        f"/api/sticker-packs/{pid}/stickers", json={"image_url": IMG}, headers=h
    )
    r = client.delete(f"/api/sticker-packs/{pid}", headers=h)
    assert r.status_code == 200, r.text
    r = client.get("/api/sticker-packs", headers=h)
    assert pid not in [p["id"] for p in r.json()["data"]]
    # builtin packs cannot be touched (masked 404, not 403, to avoid oracle)
    r = client.get("/api/sticker-packs", headers=h)
    builtin = [p for p in r.json()["data"] if p["is_builtin"]][0]
    r = client.delete(f"/api/sticker-packs/{builtin['id']}", headers=h)
    assert r.status_code == 404, r.text
    r = client.post(
        f"/api/sticker-packs/{builtin['id']}/stickers",
        json={"image_url": IMG},
        headers=h,
    )
    assert r.status_code == 404, r.text
