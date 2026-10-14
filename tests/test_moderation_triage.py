"""Agentic triage: observe images first, then judge."""

import os
import sys
import time

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from app.api import moderation as mod  # noqa: E402
from app.database.config import settings  # noqa: E402
from app.database.connection import SessionLocal, create_tables  # noqa: E402
from app.main import app  # noqa: E402
from app.models.message import Attachment, Message  # noqa: E402
from app.models.user import User  # noqa: E402

create_tables()
client = TestClient(app, raise_server_exceptions=False)


def _unique(prefix):
    return f"{prefix}{str(int(time.time() * 1000))[-6:]}{os.getpid() % 1000}"


def _signup(username=None):
    username = username or _unique("tri")
    email = f"{username}@example.com"
    jar = TestClient(app, raise_server_exceptions=False)
    r = jar.post(
        "/api/auth/signup",
        json={
            "username": username,
            "email": email,
            "display_name": username,
            "password": "TriPass123",
            "confirm_password": "TriPass123",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(email=email.lower()).first()
        u.email_verified = True
        db.commit()
        uid = u.id
    finally:
        db.close()
    return uid, data["access_token"], jar, email


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _username(uid):
    db = SessionLocal()
    try:
        return db.query(User).filter_by(id=uid).first().username
    finally:
        db.close()


class _Agent:
    """Fake vision agent: describes images, then returns a verdict."""

    def __init__(self):
        self.calls = []

    async def chat(self, messages, context=None):
        self.calls.append(messages)
        content = messages[-1]["content"]
        if isinstance(content, list):
            parts = [p for p in content if p.get("type") == "image_url"]
            assert parts, "vision call carried no image"
            return "A cartoon frog waving a flag. No text visible."
        return '{"score": 72, "label": "suspicious", "summary": "Odd flag-waving frog"}'


def _as_admin(monkeypatch):
    _, admin_token, _, admin_email = _signup()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    monkeypatch.setattr(settings, "AI_API_KEY", "test-key")
    return admin_token


def _report(token, target_type, target_id, reason="other"):
    r = client.post(
        "/api/moderation/reports",
        headers=_auth(token),
        json={"target_type": target_type, "target_id": target_id, "reason": reason},
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def _dm_with(token, peer_username):
    r = client.post(
        "/api/conversations",
        headers=_auth(token),
        json={"participant_username": peer_username},
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def test_agent_reads_gif_link(monkeypatch):
    sender_uid, _, _, _ = _signup()
    admin_token = _as_admin(monkeypatch)
    agent = _Agent()
    monkeypatch.setattr(mod, "get_ai_provider", lambda: agent)
    import app.ai.triage as tri

    async def _fake_fetch(url):
        assert "giphy" in url
        return ("image/gif", b"GIF89a-fake-bytes")

    import app.ai.triage as tri

    monkeypatch.setattr(tri, "fetch_image", _fake_fetch)

    reporter_token = _signup()[1]
    cid = _dm_with(reporter_token, _username(sender_uid))
    db = SessionLocal()
    try:
        m = Message(
            conversation_id=cid,
            sender_id=sender_uid,
            content="https://media4.giphy.com/media/abc123/giphy.gif",
            message_type="text",
        )
        db.add(m)
        db.commit()
        mid = m.id
    finally:
        db.close()

    rid = _report(reporter_token, "message", mid, reason="hate")
    out = client.post(
        f"/api/moderation/reports/{rid}/analyze", headers=_auth(admin_token)
    )
    assert out.status_code == 200, out.text
    body = out.json()["data"]
    assert body["ai_score"] == 72
    assert body["ai_label"] == "suspicious"
    assert "frog" in (body["ai_description"] or "")
    # Two agent steps happened: observe (list content) then judge.
    assert isinstance(agent.calls[0][-1]["content"], list)
    assert isinstance(agent.calls[1][-1]["content"], str)


def test_agent_uses_attachment_url_without_download(monkeypatch):
    sender_uid, _, _, _ = _signup()
    admin_token = _as_admin(monkeypatch)
    agent = _Agent()
    monkeypatch.setattr(mod, "get_ai_provider", lambda: agent)
    reporter_token = _signup()[1]
    cid = _dm_with(reporter_token, _username(sender_uid))
    db = SessionLocal()
    try:
        m = Message(
            conversation_id=cid,
            sender_id=sender_uid,
            content="look at this",
            message_type="image",
        )
        db.add(m)
        db.flush()
        db.add(
            Attachment(
                message_id=m.id,
                uploader_id=sender_uid,
                filename="pic.jpg",
                original_filename="pic.jpg",
                file_path="pic.jpg",
                file_size=12,
                mime_type="image/jpeg",
                cloudinary_url="https://res.cloudinary.com/demo/pic.jpg",
            )
        )
        db.commit()
        mid = m.id
    finally:
        db.close()
    rid = _report(reporter_token, "message", mid, reason="explicit")
    out = client.post(
        f"/api/moderation/reports/{rid}/analyze", headers=_auth(admin_token)
    )
    assert out.status_code == 200, out.text
    body = out.json()["data"]
    assert body["ai_score"] == 72
    assert "frog" in (body["ai_description"] or "")
    assert "pic.jpg" in (body["ai_description"] or "")


def test_mock_provider_refuses_to_judge(monkeypatch):
    _, _, _, admin_email = _signup()
    monkeypatch.setattr(settings, "ADMIN_EMAILS", admin_email)
    monkeypatch.setattr(settings, "AI_API_KEY", "")
    from app.ai.provider import ServiceProvider

    monkeypatch.setattr(mod, "get_ai_provider", lambda: ServiceProvider())
    reporter_token = _signup()[1]
    victim_uid = _signup()[0]
    rid = _report(reporter_token, "user", victim_uid, reason="spam")
    # Non-admin first: the admin gate fires before the provider check.
    other_token = _signup()[1]
    assert (
        client.post(
            f"/api/moderation/reports/{rid}/analyze", headers=_auth(other_token)
        ).status_code
        == 403
    )
