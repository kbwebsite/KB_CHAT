from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.message import Message
from app.models.saved import SavedMessage
from app.schemas.common import success_response
from sqlalchemy import desc

router = APIRouter(prefix="/api/saved-messages", tags=["saved"])

@router.get("")
def list_saved(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    saves = db.query(SavedMessage).filter_by(user_id=current_user.id).order_by(desc(SavedMessage.saved_at)).all()
    result=[]
    for s in saves:
        msg = db.query(Message).filter_by(id=s.message_id).first()
        if not msg:
            continue
        sender = db.query(User).filter_by(id=msg.sender_id).first() if msg.sender_id else None
        result.append({
            "id": s.id,
            "message_id": msg.id,
            "content": msg.content if not msg.is_deleted else "Message deleted",
            "sender_username": sender.username if sender else None,
            "sender_display_name": sender.display_name if sender else None,
            "conversation_id": msg.conversation_id,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
            "saved_at": s.saved_at.isoformat() if s.saved_at else None,
        })
    return success_response(result)

@router.post("/{message_id}")
def save_message(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    # check membership
    from app.models.conversation import ConversationMember
    if not db.query(ConversationMember).filter_by(conversation_id=msg.conversation_id, user_id=current_user.id).first():
        raise HTTPException(status_code=403, detail="Not a member")
    existing = db.query(SavedMessage).filter_by(user_id=current_user.id, message_id=message_id).first()
    if existing:
        return success_response({"message_id": message_id}, "Already saved")
    saved = SavedMessage(user_id=current_user.id, message_id=message_id)
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return success_response({"id": saved.id, "message_id": message_id}, "Saved")

@router.delete("/{message_id}")
def unsave_message(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    saved = db.query(SavedMessage).filter_by(user_id=current_user.id, message_id=message_id).first()
    if not saved:
        raise HTTPException(status_code=404, detail="Not saved")
    db.delete(saved)
    db.commit()
    return success_response(None, "Unsaved")
