"""Push delivery via Firebase Cloud Messaging (HTTP v1).

Disabled by default: without FIREBASE_CREDENTIALS_JSON configured every send
is a no-op (logged once) so deploys never depend on Firebase existing.
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_configured: object = None  # None=unchecked, False=disabled, dict=service account
_logged_disabled = False


def _load_account():
    global _configured, _logged_disabled
    if _configured is not None:
        return _configured if _configured else None
    try:
        from app.database.config import settings

        raw = (settings.FIREBASE_CREDENTIALS_JSON or "").strip()
    except Exception:
        raw = ""
    if not raw:
        _configured = False
        if not _logged_disabled:
            _logged_disabled = True
            print("[fcm] disabled (FIREBASE_CREDENTIALS_JSON not set)")
        return None
    try:
        _configured = json.loads(raw)
        return _configured
    except Exception as e:
        _configured = False
        print(f"[fcm] disabled (bad credentials JSON: {e})")
        return None


def is_configured() -> bool:
    return _load_account() is not None


def _access_token(account: dict) -> Optional[str]:
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request

        creds = service_account.Credentials.from_service_account_info(
            account, scopes=["https://www.googleapis.com/auth/firebase.messaging"]
        )
        creds.refresh(Request())
        return creds.token
    except Exception as e:
        print(f"[fcm] token mint failed: {e}")
        return None


async def send_to_token(
    token: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    high_priority: bool = False,
) -> bool:
    """Send one push. Returns True on accept; False (incl. gone tokens)."""
    account = _load_account()
    if not account:
        return False
    project_id = account.get("project_id")
    if not project_id:
        print("[fcm] credentials lack project_id")
        return False
    access = _access_token(account)
    if not access:
        return False
    import httpx

    message: dict = {
        "token": token,
        "notification": {"title": title, "body": body},
        "data": {k: str(v) for k, v in (data or {}).items()},
        "webpush": {
            "fcm_options": {
                "link": f"/chat{('?conv=' + str((data or {}).get('conversation_id'))) if (data or {}).get('conversation_id') else ''}"
            }
        },
    }
    if high_priority:
        message["android"] = {"priority": "high"}
        message["webpush"]["headers"] = {"Urgency": "high"}
    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {access}",
                    "Content-Type": "application/json",
                },
                json={"message": message, "validate_only": False},
            )
        if r.status_code == 200:
            return True
        print(f"[fcm] send failed {r.status_code}: {r.text[:200]}")
        return False
    except Exception as e:
        print(f"[fcm] send error: {e}")
        return False


async def notify_new_message(db, conv_id: int, msg: dict, sender_id) -> int:
    """Push offline members about a new message. Never leaks ciphertext:
    encrypted bodies always arrive as a generic line."""
    from datetime import datetime, timezone
    from app.models.conversation import Conversation, ConversationMember
    from app.websocket.manager import manager

    members = db.query(ConversationMember).filter_by(conversation_id=conv_id).all()
    if not members:
        return 0
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    sender_name = (
        msg.get("sender_display_name") or msg.get("sender_username") or "Someone"
    )
    if conv is not None and conv.is_group:
        title = f"{sender_name} in {conv.title or 'a group'}"
    else:
        title = sender_name
    if msg.get("is_encrypted"):
        body = "🔒 New message"
    else:
        body = (msg.get("content") or "New message")[:140]
    now = datetime.now(timezone.utc)
    sent = 0
    for m in members:
        if m.user_id == sender_id:
            continue
        try:
            if manager.is_online(m.user_id):
                continue
        except Exception:
            pass
        if m.is_muted:
            continue
        mu = m.muted_until
        if mu is not None:
            try:
                if mu.tzinfo is None:
                    mu = mu.replace(tzinfo=timezone.utc)
                if mu > now:
                    continue
            except Exception:
                pass
        sent += await notify_user_tokens(
            db,
            m.user_id,
            title[:120],
            body,
            data={
                "type": "message",
                "conversation_id": conv_id,
                "message_id": msg.get("id"),
            },
        )
    return sent


async def notify_user_tokens(
    db,
    user_id: int,
    title: str,
    body: str,
    data: Optional[dict] = None,
    high_priority: bool = False,
) -> int:
    """Fan out to all of a user's devices. Returns accepted count."""
    from app.models.push_token import DeviceToken

    tokens = db.query(DeviceToken).filter_by(user_id=user_id).all()
    if tokens:
        print(f"[fcm] user {user_id}: {len(tokens)} device(s), title={title[:60]!r}")
    sent = 0
    for t in tokens:
        ok = await send_to_token(
            t.token, title, body, data=data, high_priority=high_priority
        )
        if ok:
            sent += 1
        # else: keep the token; FCM UNREGISTERED handling would prune here
        # (v1 returns the error inside details — log-only for now).
    if tokens:
        print(f"[fcm] user {user_id}: accepted {sent}/{len(tokens)}")
    return sent
