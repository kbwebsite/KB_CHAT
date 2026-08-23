from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import ConversationMember
from app.models.message import Message
from app.models.scheduled import ScheduledMessage
from app.schemas.common import success_response
from app.websocket.manager import manager

router = APIRouter(prefix="/api", tags=["scheduled"])

def _is_member(db, cid, uid):
    return db.query(ConversationMember).filter_by(conversation_id=cid, user_id=uid).first() is not None

def _member_ids(db, cid):
    return [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=cid).all()]

@router.post("/conversations/{conv_id}/scheduled")
async def create_scheduled(conv_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content required")
    scheduled_at = None
    if payload.get("scheduled_at"):
        try:
            scheduled_at = datetime.fromisoformat(payload["scheduled_at"].replace("Z", "+00:00"))
        except: pass
    if not scheduled_at or scheduled_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Schedule time must be in the future")
    sm = ScheduledMessage(conversation_id=conv_id, sender_id=current_user.id, content=content, scheduled_at=scheduled_at)
    db.add(sm)
    db.commit()
    db.refresh(sm)
    return success_response({
        "id": sm.id, "conversation_id": sm.conversation_id, "content": sm.content,
        "scheduled_at": sm.scheduled_at.isoformat() if sm.scheduled_at else None,
        "sent": sm.sent, "created_at": sm.created_at.isoformat() if sm.created_at else None,
    }, "Message scheduled")

@router.get("/conversations/{conv_id}/scheduled")
def list_scheduled(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    items = db.query(ScheduledMessage).filter_by(conversation_id=conv_id, sender_id=current_user.id, sent=False).order_by(ScheduledMessage.scheduled_at).all()
    return success_response([{
        "id": sm.id, "conversation_id": sm.conversation_id, "content": sm.content,
        "scheduled_at": sm.scheduled_at.isoformat() if sm.scheduled_at else None,
        "sent": sm.sent,
    } for sm in items])

@router.patch("/scheduled/{sm_id}")
def update_scheduled(sm_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sm = db.query(ScheduledMessage).filter_by(id=sm_id, sender_id=current_user.id).first()
    if not sm:
        raise HTTPException(status_code=404, detail="Not found")
    if sm.sent:
        raise HTTPException(status_code=400, detail="Already sent")
    if payload.get("content"):
        sm.content = payload["content"]
    if payload.get("scheduled_at"):
        try:
            sm.scheduled_at = datetime.fromisoformat(payload["scheduled_at"].replace("Z", "+00:00"))
        except: pass
    db.commit()
    return success_response({"id": sm.id, "content": sm.content, "scheduled_at": sm.scheduled_at.isoformat() if sm.scheduled_at else None}, "Updated")

@router.delete("/scheduled/{sm_id}")
def cancel_scheduled(sm_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sm = db.query(ScheduledMessage).filter_by(id=sm_id, sender_id=current_user.id).first()
    if not sm:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(sm)
    db.commit()
    return success_response(None, "Cancelled")

# Background checker - called periodically to send due messages
async def check_scheduled_messages():
    from app.database.connection import SessionLocal
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due = db.query(ScheduledMessage).filter(ScheduledMessage.sent == False, ScheduledMessage.scheduled_at <= now).all()
        for sm in due:
            msg = Message(conversation_id=sm.conversation_id, sender_id=sm.sender_id, content=sm.content, message_type=sm.message_type)
            db.add(msg)
            db.flush()
            sm.sent = True
            member_ids = _member_ids(db, sm.conversation_id)
            from app.models.user import User as UserModel
            sender = db.query(UserModel).filter_by(id=sm.sender_id).first()
            msg_dict = {
                "id": msg.id, "conversation_id": msg.conversation_id, "sender_id": msg.sender_id,
                "sender_username": sender.username if sender else None,
                "sender_display_name": sender.display_name if sender else None,
                "sender_avatar": sender.avatar_url if sender else None,
                "content": msg.content, "message_type": msg.message_type,
                "is_deleted": False, "is_edited": False,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "attachments": [], "reactions": [], "status": "sent",
            }
            await manager.broadcast_to_conversation(sm.conversation_id, {"type": "message.new", "payload": msg_dict}, member_ids=member_ids)
        if due:
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
