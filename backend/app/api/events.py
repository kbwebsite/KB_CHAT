from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.event import GroupEvent, EventResponse
from app.schemas.common import success_response
from app.websocket.manager import manager

router = APIRouter(prefix="/api", tags=["events"])

def _is_member(db, cid, uid):
    return db.query(ConversationMember).filter_by(conversation_id=cid, user_id=uid).first() is not None

def _event_to_dict(db, ev):
    responses = db.query(EventResponse).filter_by(event_id=ev.id).all()
    going = [r.user_id for r in responses if r.response == "going"]
    maybe = [r.user_id for r in responses if r.response == "maybe"]
    cant_go = [r.user_id for r in responses if r.response == "cant_go"]
    creator = db.query(User).filter_by(id=ev.creator_id).first()
    return {
        "id": ev.id, "conversation_id": ev.conversation_id, "creator_id": ev.creator_id,
        "creator_name": creator.display_name if creator else "Unknown",
        "title": ev.title, "description": ev.description,
        "event_date": ev.event_date.isoformat() if ev.event_date else None,
        "location": ev.location,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
        "going_count": len(going), "maybe_count": len(maybe), "cant_go_count": len(cant_go),
        "going": going, "maybe": maybe, "cant_go": cant_go,
        "total_responses": len(responses),
    }

@router.post("/conversations/{conv_id}/events")
async def create_event(conv_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    title = payload.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title required")
    event_date = None
    if payload.get("event_date"):
        try:
            event_date = datetime.fromisoformat(payload["event_date"].replace("Z", "+00:00"))
        except: pass
    ev = GroupEvent(conversation_id=conv_id, creator_id=current_user.id, title=title,
                    description=payload.get("description"), event_date=event_date, location=payload.get("location"))
    db.add(ev)
    db.commit()
    db.refresh(ev)
    from app.models.conversation import ConversationMember
    member_ids = [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]
    await manager.broadcast_to_conversation(conv_id, {"type": "event.created", "payload": _event_to_dict(db, ev)}, member_ids=member_ids)
    return success_response(_event_to_dict(db, ev), "Event created")

@router.get("/conversations/{conv_id}/events")
def list_events(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    events = db.query(GroupEvent).filter_by(conversation_id=conv_id).order_by(desc(GroupEvent.event_date)).limit(50).all()
    return success_response([_event_to_dict(db, e) for e in events])

@router.post("/events/{event_id}/respond")
async def respond_event(event_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ev = db.query(GroupEvent).filter_by(id=event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if not _is_member(db, ev.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    response = payload.get("response", "going")
    if response not in ("going", "maybe", "cant_go"):
        raise HTTPException(status_code=400, detail="Invalid response")
    existing = db.query(EventResponse).filter_by(event_id=event_id, user_id=current_user.id).first()
    if existing:
        existing.response = response
    else:
        db.add(EventResponse(event_id=event_id, user_id=current_user.id, response=response))
    db.commit()
    from app.models.conversation import ConversationMember
    member_ids = [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=ev.conversation_id).all()]
    await manager.broadcast_to_conversation(ev.conversation_id, {"type": "event.updated", "payload": _event_to_dict(db, ev)}, member_ids=member_ids)
    return success_response(_event_to_dict(db, ev), "Response recorded")

@router.delete("/events/{event_id}")
async def delete_event(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ev = db.query(GroupEvent).filter_by(id=event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if ev.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only creator can delete")
    conv_id = ev.conversation_id
    db.delete(ev)
    db.commit()
    from app.models.conversation import ConversationMember
    member_ids = [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]
    await manager.broadcast_to_conversation(conv_id, {"type": "event.deleted", "payload": {"id": event_id, "conversation_id": conv_id}}, member_ids=member_ids)
    return success_response(None, "Event deleted")
