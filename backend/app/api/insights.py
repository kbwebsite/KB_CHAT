from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timezone, timedelta
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message, Attachment
from app.models.call import CallHistory
from app.schemas.common import success_response

router = APIRouter(prefix="/api", tags=["insights"])


def _is_member(db, cid, uid):
    return (
        db.query(ConversationMember).filter_by(conversation_id=cid, user_id=uid).first()
        is not None
    )


@router.get("/conversations/{conv_id}/insights")
def chat_insights(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    total_msgs = (
        db.query(Message).filter_by(conversation_id=conv_id, is_deleted=False).count()
    )
    my_msgs = (
        db.query(Message)
        .filter_by(conversation_id=conv_id, sender_id=current_user.id, is_deleted=False)
        .count()
    )
    # media count
    msg_ids = [
        m.id
        for m in db.query(Message)
        .filter_by(conversation_id=conv_id, is_deleted=False)
        .all()
    ]
    images = (
        db.query(Attachment)
        .filter(
            Attachment.message_id.in_(msg_ids), Attachment.mime_type.like("image/%")
        )
        .count()
        if msg_ids
        else 0
    )
    videos = (
        db.query(Attachment)
        .filter(
            Attachment.message_id.in_(msg_ids), Attachment.mime_type.like("video/%")
        )
        .count()
        if msg_ids
        else 0
    )
    files = (
        db.query(Attachment)
        .filter(
            Attachment.message_id.in_(msg_ids),
            ~Attachment.mime_type.like("image/%"),
            ~Attachment.mime_type.like("video/%"),
            ~Attachment.mime_type.like("audio/%"),
        )
        .count()
        if msg_ids
        else 0
    )
    audio = (
        db.query(Attachment)
        .filter(
            Attachment.message_id.in_(msg_ids), Attachment.mime_type.like("audio/%")
        )
        .count()
        if msg_ids
        else 0
    )
    # shared days
    first_msg = (
        db.query(Message)
        .filter_by(conversation_id=conv_id)
        .order_by(Message.created_at)
        .first()
    )
    shared_days = 1
    if first_msg and first_msg.created_at:
        delta = (
            datetime.now(timezone.utc)
            - first_msg.created_at.replace(tzinfo=timezone.utc)
            if first_msg.created_at.tzinfo is None
            else datetime.now(timezone.utc) - first_msg.created_at
        )
        shared_days = max(1, delta.days + 1)
    # media bytes
    total_bytes = 0
    if msg_ids:
        result = (
            db.query(func.sum(Attachment.file_size))
            .filter(Attachment.message_id.in_(msg_ids))
            .scalar()
        )
        total_bytes = result or 0
    # Top chatters: most prolific senders in this conversation.
    top_rows = (
        db.query(Message.sender_id, func.count(Message.id).label("n"))
        .filter_by(conversation_id=conv_id, is_deleted=False)
        .filter(Message.sender_id.isnot(None))
        .group_by(Message.sender_id)
        .order_by(desc("n"))
        .limit(3)
        .all()
    )
    top_ids = [r[0] for r in top_rows]
    top_users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(top_ids)).all()}
        if top_ids
        else {}
    )
    top_chatters = [
        {
            "user_id": sid,
            "display_name": (top_users[sid].display_name if sid in top_users else None),
            "username": (top_users[sid].username if sid in top_users else None),
            "count": n,
            "is_me": sid == current_user.id,
        }
        for sid, n in top_rows
    ]
    return success_response(
        {
            "total_messages": total_msgs,
            "my_messages": my_msgs,
            "images": images,
            "videos": videos,
            "files": files,
            "audio": audio,
            "shared_days": shared_days,
            "total_media_bytes": total_bytes,
            "top_chatters": top_chatters,
        }
    )


@router.get("/storage")
def storage_dashboard(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    member_convs = [
        m.conversation_id
        for m in db.query(ConversationMember).filter_by(user_id=current_user.id).all()
    ]
    if not member_convs:
        return success_response(
            {"images": 0, "videos": 0, "files": 0, "audio": 0, "total": 0, "items": []}
        )
    msg_ids = [
        m.id
        for m in db.query(Message)
        .filter(
            Message.conversation_id.in_(member_convs),
            Message.sender_id == current_user.id,
        )
        .all()
    ]
    if not msg_ids:
        return success_response(
            {"images": 0, "videos": 0, "files": 0, "audio": 0, "total": 0, "items": []}
        )
    cats = {}
    for mime, cat in [
        ("image/%", "images"),
        ("video/%", "videos"),
        ("audio/%", "audio"),
    ]:
        result = (
            db.query(func.sum(Attachment.file_size))
            .filter(Attachment.message_id.in_(msg_ids), Attachment.mime_type.like(mime))
            .scalar()
        )
        cats[cat] = result or 0
    result = (
        db.query(func.sum(Attachment.file_size))
        .filter(
            Attachment.message_id.in_(msg_ids),
            ~Attachment.mime_type.like("image/%"),
            ~Attachment.mime_type.like("video/%"),
            ~Attachment.mime_type.like("audio/%"),
        )
        .scalar()
    )
    cats["files"] = result or 0
    cats["total"] = sum(cats.values())
    # top items
    items = (
        db.query(Attachment)
        .filter(Attachment.message_id.in_(msg_ids))
        .order_by(desc(Attachment.file_size))
        .limit(20)
        .all()
    )
    item_list = [
        {
            "id": a.id,
            "filename": a.original_filename,
            "mime_type": a.mime_type,
            "file_size": a.file_size,
        }
        for a in items
    ]
    return success_response({**cats, "items": item_list})
