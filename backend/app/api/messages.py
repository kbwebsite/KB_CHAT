from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, asc, or_, func
from typing import Optional
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import ConversationMember
from app.models.message import Message, MessageReaction, Attachment
from app.schemas.message import MessageCreate, MessageUpdate, ReactionCreate
from app.schemas.common import success_response
from app.websocket.manager import manager
from app.utils.receipts import (
    receipt_map,
    compute_status,
    broadcast_status_upgrades,
)

router = APIRouter(prefix="/api", tags=["messages"])


def _is_member(db: Session, conv_id: int, user_id: int) -> bool:
    return (
        db.query(ConversationMember)
        .filter_by(conversation_id=conv_id, user_id=user_id)
        .first()
        is not None
    )


def _member_ids(db: Session, conv_id: int):
    return [
        m.user_id
        for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()
    ]


def _message_to_dict(msg: Message, receipts: dict = None):
    """Convert message to dict - relationships already loaded via eager loading.

    Pass a receipts map ({user_id: (delivered_id, read_id)}) to compute the
    real tick status; without it the status falls back to "sent".
    """
    sender = msg.sender
    atts = msg.attachments
    reacts = msg.reactions
    reply_content = None
    if msg.reply_to_id:
        replied = msg.reply_to
        if replied and not replied.is_deleted:
            reply_content = replied.content
        elif replied and replied.is_deleted:
            reply_content = "Message deleted"
    content = msg.content
    if msg.is_deleted:
        content = "Message deleted"
    voice_dur = msg.voice_duration
    # Find voice attachment (first attachment with audio mime type)
    voice_att = None
    for a in atts:
        if a.mime_type and a.mime_type.startswith("audio/"):
            voice_att = a
            break
    voice_cloudinary_url = voice_att.cloudinary_url if voice_att else None
    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "sender_username": sender.username if sender else None,
        "sender_display_name": sender.display_name if sender else None,
        "sender_avatar": sender.avatar_url if sender else None,
        "content": content,
        "message_type": msg.message_type,
        "voice_duration": voice_dur,
        "reply_to_id": msg.reply_to_id,
        "reply_to_content": reply_content,
        "is_deleted": msg.is_deleted,
        "is_edited": msg.is_edited,
        "is_pinned": msg.is_pinned,
        "pinned_at": msg.pinned_at.isoformat() if msg.pinned_at else None,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "updated_at": msg.updated_at.isoformat() if msg.updated_at else None,
        "attachments": [
            {
                "id": a.id,
                "filename": a.filename,
                "original_filename": a.original_filename,
                "file_path": a.file_path,
                "file_size": a.file_size,
                "mime_type": a.mime_type,
                "cloudinary_url": a.cloudinary_url,
            }
            for a in atts
        ],
        "reactions": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "username": r.user.username if r.user else None,
                "emoji": r.emoji,
            }
            for r in reacts
        ],
        "status": compute_status(msg.id, msg.sender_id, receipts)
        if receipts is not None
        else "sent",
        "voice_cloudinary_url": voice_cloudinary_url,
    }


def _get_messages_query(db: Session, conv_id: int):
    """Build query with eager loading to avoid N+1"""
    return (
        db.query(Message)
        .options(
            joinedload(Message.sender),
            joinedload(Message.attachments),
            joinedload(Message.reactions).joinedload(MessageReaction.user),
            joinedload(Message.reply_to).joinedload(Message.sender),
        )
        .filter(Message.conversation_id == conv_id)
    )


@router.get("/conversations/{conv_id}/messages")
async def list_messages(
    conv_id: int,
    limit: int = Query(50, ge=1, le=100),
    before: Optional[int] = Query(
        None, description="cursor: message id before which to fetch"
    ),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")

    q = _get_messages_query(db, conv_id)
    if search:
        q = q.filter(Message.content.ilike(f"%{search}%"))
    if before:
        q = q.filter(Message.id < before)

    # Use unique() to handle joinedload collections
    msgs = q.order_by(desc(Message.id)).limit(limit).all()
    msgs.reverse()  # oldest first

    member_ids = _member_ids(db, conv_id)

    # Fetching = arrival on this device: advance our delivered cursor so the
    # sender's ticks upgrade from single to double even after offline gaps.
    upgraded_from = None
    newest_id = msgs[-1].id if msgs else None
    membership = (
        db.query(ConversationMember)
        .filter_by(conversation_id=conv_id, user_id=current_user.id)
        .first()
    )
    if membership is not None and newest_id is not None:
        if (membership.last_delivered_message_id or 0) < newest_id:
            upgraded_from = membership.last_delivered_message_id or 0
            membership.last_delivered_message_id = newest_id
            db.commit()

    receipts = receipt_map(db, conv_id)
    result = [_message_to_dict(m, receipts) for m in msgs]

    if upgraded_from is not None:
        await broadcast_status_upgrades(
            db, conv_id, current_user.id, upgraded_from, newest_id, member_ids
        )

    # has_more?
    has_more = False
    if len(msgs) == limit:
        oldest_id = msgs[0].id if msgs else None
        if oldest_id:
            remaining = (
                db.query(Message)
                .filter(Message.conversation_id == conv_id, Message.id < oldest_id)
                .count()
            )
            has_more = remaining > 0
    return success_response({"messages": result, "has_more": has_more})


@router.post("/conversations/{conv_id}/messages")
async def create_message(
    conv_id: int,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    if not payload.content and not payload.attachment_ids:
        raise HTTPException(
            status_code=400, detail="Message content or attachment required"
        )
    if payload.reply_to_id:
        replied = (
            db.query(Message)
            .filter_by(id=payload.reply_to_id, conversation_id=conv_id)
            .first()
        )
        if not replied:
            raise HTTPException(status_code=404, detail="Replied message not found")

    content = payload.content or ""
    if len(content) > 5000:
        raise HTTPException(status_code=400, detail="Message too long")

    msg_type = payload.message_type or "text"
    if msg_type not in ("text", "image", "file", "voice", "system"):
        msg_type = "text"

    voice_duration = payload.voice_duration

    msg = Message(
        conversation_id=conv_id,
        sender_id=current_user.id,
        content=content,
        message_type=msg_type,
        reply_to_id=payload.reply_to_id,
        voice_duration=voice_duration,
    )
    db.add(msg)
    db.flush()

    # attach attachments if any
    if payload.attachment_ids:
        for aid in payload.attachment_ids:
            att = (
                db.query(Attachment)
                .filter_by(id=aid, uploader_id=current_user.id)
                .first()
            )
            if att:
                att.message_id = msg.id

    # Voice messages may reference the audio attachment via voice_file_id
    # instead of (or in addition to) attachment_ids — link it if not already.
    if msg_type == "voice" and payload.voice_file_id:
        if not payload.attachment_ids or payload.voice_file_id not in (
            payload.attachment_ids or []
        ):
            voice_att = (
                db.query(Attachment)
                .filter_by(id=payload.voice_file_id, uploader_id=current_user.id)
                .first()
            )
            if voice_att:
                voice_att.message_id = msg.id

    # Single commit for message + attachments + conversation updated_at
    from app.models.conversation import Conversation
    from datetime import datetime, timezone

    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if conv:
        conv.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(msg)

    # Load relationships for broadcast
    msg = _get_messages_query(db, conv_id).filter(Message.id == msg.id).first()
    member_ids = _member_ids(db, conv_id)
    msg_dict = _message_to_dict(msg, receipt_map(db, conv_id))

    # Fan-out AFTER responding: slow/offline recipients must not delay the
    # sender's HTTP round-trip (this was adding seconds on production).
    async def _fanout():
        try:
            await manager.broadcast_to_conversation(
                conv_id,
                {"type": "message.new", "payload": msg_dict},
                member_ids=member_ids,
            )
        except Exception as e:
            print(f"[messages] message.new fan-out failed: {e}")

    import asyncio

    asyncio.create_task(_fanout())
    return success_response(msg_dict, "Message sent")


@router.patch("/messages/{message_id}")
async def edit_message(
    message_id: int,
    payload: MessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only edit own messages")
    if msg.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot edit deleted message")
    if payload.content is not None:
        if not payload.content.strip():
            raise HTTPException(status_code=400, detail="Message content required")
        if len(payload.content) > 5000:
            raise HTTPException(status_code=400, detail="Message too long")
        msg.content = payload.content
    if payload.voice_duration is not None:
        if msg.message_type != "voice":
            raise HTTPException(
                status_code=400, detail="voice_duration only applies to voice messages"
            )
        msg.voice_duration = payload.voice_duration
    if payload.content is None and payload.voice_duration is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    msg.is_edited = True
    db.commit()
    db.refresh(msg)
    msg_dict = _message_to_dict(msg, receipt_map(db, msg.conversation_id))
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(
        msg.conversation_id,
        {"type": "message.updated", "payload": msg_dict},
        member_ids=member_ids,
    )
    return success_response(msg_dict, "Message updated")


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only delete own messages")
    msg.is_deleted = True
    msg.content = "Message deleted"
    from datetime import datetime, timezone

    msg.deleted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    msg_dict = _message_to_dict(msg, receipt_map(db, msg.conversation_id))
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(
        msg.conversation_id,
        {
            "type": "message.deleted",
            "payload": {
                "id": msg.id,
                "conversation_id": msg.conversation_id,
                "is_deleted": True,
                "content": "Message deleted",
            },
        },
        member_ids=member_ids,
    )
    return success_response(msg_dict, "Message deleted")


@router.post("/messages/{message_id}/reactions")
async def add_reaction(
    message_id: int,
    payload: ReactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if not _is_member(db, msg.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    existing = (
        db.query(MessageReaction)
        .filter_by(message_id=message_id, user_id=current_user.id, emoji=payload.emoji)
        .first()
    )
    if existing:
        return success_response(
            {"message_id": message_id, "emoji": payload.emoji}, "Already reacted"
        )
    react = MessageReaction(
        message_id=message_id, user_id=current_user.id, emoji=payload.emoji
    )
    db.add(react)
    db.commit()
    db.refresh(react)
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(
        msg.conversation_id,
        {
            "type": "reaction.added",
            "payload": {
                "message_id": message_id,
                "user_id": current_user.id,
                "emoji": payload.emoji,
                "id": react.id,
            },
        },
        member_ids=member_ids,
    )
    return success_response(
        {"id": react.id, "message_id": message_id, "emoji": payload.emoji},
        "Reaction added",
    )


@router.delete("/messages/{message_id}/reactions")
async def remove_reaction(
    message_id: int,
    emoji: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    react = (
        db.query(MessageReaction)
        .filter_by(message_id=message_id, user_id=current_user.id, emoji=emoji)
        .first()
    )
    if not react:
        raise HTTPException(status_code=404, detail="Reaction not found")
    db.delete(react)
    db.commit()
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(
        msg.conversation_id,
        {
            "type": "reaction.removed",
            "payload": {
                "message_id": message_id,
                "user_id": current_user.id,
                "emoji": emoji,
            },
        },
        member_ids=member_ids,
    )
    return success_response(None, "Reaction removed")


@router.post("/messages/{message_id}/read")
async def mark_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if not _is_member(db, msg.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    from app.models.conversation import ConversationMember

    membership = (
        db.query(ConversationMember)
        .filter_by(conversation_id=msg.conversation_id, user_id=current_user.id)
        .first()
    )
    old_read = None
    if membership:
        old_read = membership.last_read_message_id
        if old_read is None or message_id > old_read:
            membership.last_read_message_id = message_id
        # Seeing a message implies it reached this device.
        if (membership.last_delivered_message_id or 0) < message_id:
            membership.last_delivered_message_id = message_id
        db.commit()
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(
        msg.conversation_id,
        {
            "type": "message.read",
            "payload": {
                "message_id": message_id,
                "conversation_id": msg.conversation_id,
                "user_id": current_user.id,
            },
        },
        member_ids=member_ids,
    )
    await broadcast_status_upgrades(
        db, msg.conversation_id, current_user.id, old_read, message_id, member_ids
    )
    return success_response(None, "Marked read")


@router.post("/messages/{message_id}/delivered")
async def mark_message_delivered(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Device-arrival ack: message reached the recipient's device (2nd tick)."""
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if not _is_member(db, msg.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    from app.models.conversation import ConversationMember

    membership = (
        db.query(ConversationMember)
        .filter_by(conversation_id=msg.conversation_id, user_id=current_user.id)
        .first()
    )
    old_delivered = None
    if membership:
        old_delivered = membership.last_delivered_message_id
        if (old_delivered or 0) < message_id:
            membership.last_delivered_message_id = message_id
            db.commit()
    member_ids = _member_ids(db, msg.conversation_id)
    await broadcast_status_upgrades(
        db,
        msg.conversation_id,
        current_user.id,
        old_delivered,
        message_id,
        member_ids,
    )
    return success_response(None, "Marked delivered")


@router.get("/messages/search")
def search_messages(
    q: str = Query(..., min_length=1),
    conversation_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member_convs = [
        m.conversation_id
        for m in db.query(ConversationMember).filter_by(user_id=current_user.id).all()
    ]
    if not member_convs:
        return success_response([])
    query = db.query(Message).filter(
        Message.conversation_id.in_(member_convs),
        Message.is_deleted == False,
        Message.content.ilike(f"%{q}%"),
    )
    if conversation_id:
        if conversation_id not in member_convs:
            raise HTTPException(status_code=403, detail="Not a member")
        query = query.filter(Message.conversation_id == conversation_id)
    msgs = query.order_by(desc(Message.created_at)).limit(50).all()
    receipts_cache: dict = {}

    def _receipts_for(conv_id: int):
        if conv_id not in receipts_cache:
            receipts_cache[conv_id] = receipt_map(db, conv_id)
        return receipts_cache[conv_id]

    result = [_message_to_dict(m, _receipts_for(m.conversation_id)) for m in msgs]
    return success_response(result)


@router.post("/messages/{message_id}/pin")
async def pin_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if not _is_member(db, msg.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    from datetime import datetime, timezone

    msg.is_pinned = True
    msg.pinned_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    msg_dict = _message_to_dict(msg, receipt_map(db, msg.conversation_id))
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(
        msg.conversation_id,
        {"type": "message.pinned", "payload": msg_dict},
        member_ids=member_ids,
    )
    return success_response(msg_dict, "Message pinned")


@router.post("/messages/{message_id}/unpin")
async def unpin_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if not _is_member(db, msg.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    msg.is_pinned = False
    msg.pinned_at = None
    db.commit()
    db.refresh(msg)
    msg_dict = _message_to_dict(msg, receipt_map(db, msg.conversation_id))
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(
        msg.conversation_id,
        {"type": "message.unpinned", "payload": msg_dict},
        member_ids=member_ids,
    )
    return success_response(msg_dict, "Message unpinned")


@router.get("/conversations/{conv_id}/pinned")
def list_pinned_messages(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    msgs = (
        _get_messages_query(db, conv_id)
        .filter(Message.is_pinned == True)
        .order_by(desc(Message.pinned_at))
        .limit(50)
        .all()
    )
    receipts = receipt_map(db, conv_id)
    return success_response([_message_to_dict(m, receipts) for m in msgs])
