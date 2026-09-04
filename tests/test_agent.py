import os
import sys
import time
import uuid

# Ensure backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../backend'))

from fastapi.testclient import TestClient

from app.main import app
from app.database.connection import create_tables

create_tables()
client = TestClient(app)


def _signup():
    suffix = uuid.uuid4().hex[:8]
    u = f"agent{suffix}"
    e = f"{u}@ex.com"
    r = client.post("/api/auth/signup", json={
        "username": u,
        "email": e,
        "display_name": "Agent User",
        "password": "password123",
        "confirm_password": "password123",
    })
    assert r.status_code == 200, r.text
    token = r.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_agent_chat_persists_conversation():
    headers = _signup()

    # First turn creates a conversation
    r = client.post("/api/ai/agent/chat", json={"message": "How do I create a group?"}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["response"]
    conv_id = data["conversation_id"]
    assert conv_id

    # Second turn continues the same conversation
    r2 = client.post("/api/ai/agent/chat", json={"message": "And polls?", "conversation_id": conv_id}, headers=headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["conversation_id"] == conv_id

    # History has both turns (user + assistant each)
    r3 = client.get(f"/api/ai/agent/conversations/{conv_id}/messages", headers=headers)
    assert r3.status_code == 200, r3.text
    msgs = r3.json()["data"]["messages"]
    assert len(msgs) == 4
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    assert msgs[0]["content"] == "How do I create a group?"

    # Listed among conversations
    r4 = client.get("/api/ai/agent/conversations", headers=headers)
    assert r4.status_code == 200, r4.text
    assert any(c["id"] == conv_id for c in r4.json()["data"])

    # Empty message rejected
    r5 = client.post("/api/ai/agent/chat", json={"message": "  "}, headers=headers)
    assert r5.status_code == 422


def test_agent_conversation_ownership_and_delete():
    owner = _signup()
    other = _signup()

    r = client.post("/api/ai/agent/chat", json={"message": "Hello agent"}, headers=owner)
    assert r.status_code == 200, r.text
    conv_id = r.json()["data"]["conversation_id"]

    # Another user cannot read it
    r2 = client.get(f"/api/ai/agent/conversations/{conv_id}/messages", headers=other)
    assert r2.status_code == 404

    # Another user cannot continue it
    r3 = client.post("/api/ai/agent/chat", json={"message": "hijack", "conversation_id": conv_id}, headers=other)
    assert r3.status_code == 404

    # Owner deletes; history gone afterwards
    r4 = client.delete(f"/api/ai/agent/conversations/{conv_id}", headers=owner)
    assert r4.status_code == 200, r4.text
    r5 = client.get(f"/api/ai/agent/conversations/{conv_id}/messages", headers=owner)
    assert r5.status_code == 404


def test_agent_stream_persists_turn():
    headers = _signup()
    with client.stream("POST", "/api/ai/agent/chat/stream", json={"message": "How do video calls work?"}, headers=headers) as r:
        assert r.status_code == 200, r.text
        body = r.read().decode()
    assert "conversation" in body
    assert "[DONE]" in body

    r2 = client.get("/api/ai/agent/conversations", headers=headers)
    assert r2.status_code == 200, r2.text
    convs = r2.json()["data"]
    assert len(convs) >= 1
    r3 = client.get(f"/api/ai/agent/conversations/{convs[0]['id']}/messages", headers=headers)
    msgs = r3.json()["data"]["messages"]
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[1]["role"] == "assistant"
