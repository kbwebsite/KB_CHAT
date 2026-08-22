from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, or_
from typing import Optional
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import ConversationMember
from app.models.message import Message, MessageReaction, Attachment
from app.schemas.message import MessageCreate, MessageUpdate, ReactionCreate
from app.schemas.common import success_response
from app.websocket.manager import manager

router = APIRouter(prefix="/api", tags=["messages"])

def _is_member(db: Session, conv_id: int, user_id: int) -> bool:
    return db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=user_id).first() is not None

def _member_ids(db: Session, conv_id: int):
    return [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]

def _message_to_dict(db: Session, msg: Message):
    sender = db.query(User).filter_by(id=msg.sender_id).first() if msg.sender_id else None
    atts = db.query(Attachment).filter_by(message_id=msg.id).all()
    reacts = db.query(MessageReaction).filter_by(message_id=msg.id).all()
    reply_content = None
    if msg.reply_to_id:
        replied = db.query(Message).filter_by(id=msg.reply_to_id).first()
        if replied and not replied.is_deleted:
            reply_content = replied.content
        elif replied and replied.is_deleted:
            reply_content = "Message deleted"
    content = msg.content
    if msg.is_deleted:
        content = "Message deleted"
    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "sender_username": sender.username if sender else None,
        "sender_display_name": sender.display_name if sender else None,
        "sender_avatar": sender.avatar_url if sender else None,
        "content": content,
        "message_type": msg.message_type,
        "reply_to_id": msg.reply_to_id,
        "reply_to_content": reply_content,
        "is_deleted": msg.is_deleted,
        "is_edited": msg.is_edited,
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
            } for a in atts
        ],
        "reactions": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "username": db.query(User).filter_by(id=r.user_id).first().username if db.query(User).filter_by(id=r.user_id).first() else None,
                "emoji": r.emoji,
            } for r in reacts
        ],
        "status": "sent",
    }

@router.get("/conversations/{conv_id}/messages")
def list_messages(
    conv_id: int,
    limit: int = Query(50, ge=1, le=100),
    before: Optional[int] = Query(None, description="cursor: message id before which to fetch"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    q = db.query(Message).filter(Message.conversation_id == conv_id)
    if search:
        q = q.filter(Message.content.ilike(f"%{search}%"))
    if before:
        q = q.filter(Message.id < before)
    msgs = q.order_by(desc(Message.id)).limit(limit).all()
    msgs.reverse()  # oldest first
    result = [_message_to_dict(db, m) for m in msgs]
    # has_more?
    has_more = False
    if len(msgs) == limit:
        oldest_id = msgs[0].id if msgs else None
        if oldest_id:
            remaining = db.query(Message).filter(Message.conversation_id==conv_id, Message.id < oldest_id).count()
            has_more = remaining > 0
    return success_response({"messages": result, "has_more": has_more})

@router.post("/conversations/{conv_id}/messages")
async def create_message(conv_id: int, payload: MessageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    if not payload.content and not payload.attachment_ids:
        raise HTTPException(status_code=400, detail="Message content or attachment required")
    if payload.reply_to_id:
        replied = db.query(Message).filter_by(id=payload.reply_to_id, conversation_id=conv_id).first()
        if not replied:
            raise HTTPException(status_code=404, detail="Replied message not found")
    content = payload.content or ""
    if len(content) > 5000:
        raise HTTPException(status_code=400, detail="Message too long")
    msg_type = payload.message_type or "text"
    if msg_type not in ("text", "image", "file", "system"):
        msg_type = "text"
    msg = Message(
        conversation_id=conv_id,
        sender_id=current_user.id,
        content=content,
        message_type=msg_type,
        reply_to_id=payload.reply_to_id,
    )
    db.add(msg)
    db.flush()
    # attach attachments if any
    if payload.attachment_ids:
        for aid in payload.attachment_ids:
            att = db.query(Attachment).filter_by(id=aid, uploader_id=current_user.id).first()
            if att:
                att.message_id = msg.id
    db.commit()
    db.refresh(msg)
    # update conversation updated_at
    from app.models.conversation import Conversation
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if conv:
        from datetime import datetime, timezone
        conv.updated_at = datetime.now(timezone.utc)
        db.commit()
    msg_dict = _message_to_dict(db, msg)
    # broadcast via websocket
    member_ids = _member_ids(db, conv_id)
    await manager.broadcast_to_conversation(conv_id, {"type": "message.new", "payload": msg_dict}, member_ids=member_ids)
    # also send delivery event? simple
    return success_response(msg_dict, "Message sent")

@router.patch("/messages/{message_id}")
async def edit_message(message_id: int, payload: MessageUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only edit own messages")
    if msg.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot edit deleted message")
    msg.content = payload.content
    msg.is_edited = True
    db.commit()
    db.refresh(msg)
    msg_dict = _message_to_dict(db, msg)
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(msg.conversation_id, {"type": "message.updated", "payload": msg_dict}, member_ids=member_ids)
    return success_response(msg_dict, "Message updated")

@router.delete("/messages/{message_id}")
async def delete_message(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
    msg_dict = _message_to_dict(db, msg)
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(msg.conversation_id, {"type": "message.deleted", "payload": {"id": msg.id, "conversation_id": msg.conversation_id, "is_deleted": True, "content": "Message deleted"}}, member_ids=member_ids)
    return success_response(msg_dict, "Message deleted")

@router.post("/messages/{message_id}/reactions")
async def add_reaction(message_id: int, payload: ReactionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if not _is_member(db, msg.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    # check existing
    existing = db.query(MessageReaction).filter_by(message_id=message_id, user_id=current_user.id, emoji=payload.emoji).first()
    if existing:
        return success_response({"message_id": message_id, "emoji": payload.emoji}, "Already reacted")
    react = MessageReaction(message_id=message_id, user_id=current_user.id, emoji=payload.emoji)
    db.add(react)
    db.commit()
    db.refresh(react)
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(msg.conversation_id, {"type": "reaction.added", "payload": {"message_id": message_id, "user_id": current_user.id, "emoji": payload.emoji, "id": react.id}}, member_ids=member_ids)
    return success_response({"id": react.id, "message_id": message_id, "emoji": payload.emoji}, "Reaction added")

@router.delete("/messages/{message_id}/reactions")
async def remove_reaction(message_id: int, emoji: str = Query(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    react = db.query(MessageReaction).filter_by(message_id=message_id, user_id=current_user.id, emoji=emoji).first()
    if not react:
        raise HTTPException(status_code=404, detail="Reaction not found")
    db.delete(react)
    db.commit()
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(msg.conversation_id, {"type": "reaction.removed", "payload": {"message_id": message_id, "user_id": current_user.id, "emoji": emoji}}, member_ids=member_ids)
    return success_response(None, "Reaction removed")

@router.post("/messages/{message_id}/read")
async def mark_message_read(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if not _is_member(db, msg.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    # update last_read
    from app.models.conversation import ConversationMember
    membership = db.query(ConversationMember).filter_by(conversation_id=msg.conversation_id, user_id=current_user.id).first()
    if membership:
        if membership.last_read_message_id is None or message_id > membership.last_read_message_id:
            membership.last_read_message_id = message_id
            db.commit()
    member_ids = _member_ids(db, msg.conversation_id)
    await manager.broadcast_to_conversation(msg.conversation_id, {"type": "message.read", "payload": {"message_id": message_id, "conversation_id": msg.conversation_id, "user_id": current_user.id}}, member_ids=member_ids)
    return success_response(None, "Marked read")

@router.get("/messages/search")
def search_messages(q: str = Query(..., min_length=1), conversation_id: Optional[int] = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # search across user's conversations
    member_convs = [m.conversation_id for m in db.query(ConversationMember).filter_by(user_id=current_user.id).all()]
    if not member_convs:
        return success_response([])
    query = db.query(Message).filter(Message.conversation_id.in_(member_convs), Message.is_deleted==False, Message.content.ilike(f"%{q}%"))
    if conversation_id:
        if conversation_id not in member_convs:
            raise HTTPException(status_code=403, detail="Not a member")
        query = query.filter(Message.conversation_id==conversation_id)
    msgs = query.order_by(desc(Message.created_at)).limit(50).all()
    result = [_message_to_dict(db, m) for m in msgs]
    return success_response(result)
