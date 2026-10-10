"""Memories ("On this day"): resurface your messages from the same
calendar day in previous years. Read-only, member-scoped, no migration.
Burn-once and sealed contents are never exposed — placeholders instead.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, extract
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.schemas.common import success_response

router = APIRouter(prefix="/api", tags=["memories"])


def _preview(m: Message) -> str:
    if m.is_encrypted:
        return "🔒 Encrypted message"
    if m.view_once:
        return "👁 View-once message"
    if m.message_type == "image":
        return f"📷 Photo{(f' — {m.content}' if m.content else '')}"
    if m.message_type == "video":
        return "🎬 Video"
    if m.message_type == "voice":
        return "🎙 Voice message"
    if m.message_type == "video_note":
        return "🎥 Video message"
    return m.content or ""


@router.get("/memories")
def memories(
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    my_convs = [
        c[0]
        for c in db.query(ConversationMember.conversation_id)
        .filter_by(user_id=current_user.id)
        .all()
    ]
    if not my_convs:
        return success_response({"items": [], "count": 0})
    rows = (
        db.query(Message)
        .filter(
            Message.conversation_id.in_(my_convs),
            Message.is_deleted == False,  # noqa: E712
            Message.message_type.in_(("text", "image", "video", "voice", "video_note")),
            extract("year", Message.created_at) < now.year,
            extract("month", Message.created_at) == now.month,
            extract("day", Message.created_at) == now.day,
        )
        .order_by(desc(Message.created_at))
        .limit(limit)
        .all()
    )
    conv_ids = {m.conversation_id for m in rows}
    convs = (
        {
            c.id: c
            for c in db.query(Conversation).filter(Conversation.id.in_(conv_ids)).all()
        }
        if conv_ids
        else {}
    )
    sender_ids = {m.sender_id for m in rows if m.sender_id}
    users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(sender_ids)).all()}
        if sender_ids
        else {}
    )
    items = []
    for m in rows:
        created = m.created_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        years = now.year - created.year if created else 0
        conv = convs.get(m.conversation_id)
        sender = users.get(m.sender_id) if m.sender_id else None
        items.append(
            {
                "id": m.id,
                "conversation_id": m.conversation_id,
                "conversation_title": (conv.title if conv and conv.title else "Chat"),
                "sender_display_name": sender.display_name if sender else None,
                "is_mine": m.sender_id == current_user.id,
                "content": _preview(m),
                "message_type": m.message_type,
                "created_at": created.isoformat() if created else None,
                "years_ago": years,
            }
        )
    return success_response({"items": items, "count": len(items)})
