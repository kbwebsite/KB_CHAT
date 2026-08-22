from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.call import CallHistory
from app.models.conversation import ConversationMember
from app.schemas.common import success_response

router = APIRouter(prefix="/api/calls", tags=["calls"])

@router.get("/history")
def call_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    calls = db.query(CallHistory).filter(
        (CallHistory.caller_id == current_user.id) | (CallHistory.callee_id == current_user.id)
    ).order_by(desc(CallHistory.started_at)).limit(50).all()
    result=[]
    for c in calls:
        caller = db.query(User).filter_by(id=c.caller_id).first() if c.caller_id else None
        callee = db.query(User).filter_by(id=c.callee_id).first() if c.callee_id else None
        result.append({
            "id": c.id,
            "caller_id": c.caller_id,
            "caller_username": caller.username if caller else None,
            "callee_id": c.callee_id,
            "callee_username": callee.username if callee else None,
            "caller_display": caller.display_name if caller else "Unknown",
            "callee_display": callee.display_name if callee else "Unknown",
            "call_type": c.call_type,
            "status": c.status,
            "started_at": c.started_at.isoformat() if c.started_at else None,
            "ended_at": c.ended_at.isoformat() if c.ended_at else None,
            "duration_seconds": c.duration_seconds,
            "conversation_id": c.conversation_id,
        })
    return success_response(result)

@router.post("/start")
async def start_call(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    callee_id = payload.get("callee_id")
    callee_username = payload.get("callee_username")
    conversation_id = payload.get("conversation_id")
    call_type = payload.get("call_type", "voice")
    if callee_username and not callee_id:
        u = db.query(User).filter_by(username=callee_username.lower()).first()
        if u:
            callee_id = u.id
    if not callee_id:
        raise HTTPException(status_code=400, detail="callee required")
    if callee_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot call yourself")
    # verify conversation if provided
    if conversation_id:
        if not db.query(ConversationMember).filter_by(conversation_id=conversation_id, user_id=current_user.id).first():
            raise HTTPException(status_code=403, detail="Not in conversation")
    call = CallHistory(
        caller_id=current_user.id,
        callee_id=callee_id,
        conversation_id=conversation_id,
        call_type=call_type if call_type in ("voice","video") else "voice",
        status="ongoing",
        started_at=datetime.now(timezone.utc),
    )
    db.add(call)
    db.commit()
    db.refresh(call)
    # broadcast via websocket to callee
    from app.websocket.manager import manager
    await manager.send_to_user(callee_id, {
        "type": "call.incoming",
        "payload": {
            "id": call.id,
            "caller_id": current_user.id,
            "caller_username": current_user.username,
            "caller_display": current_user.display_name,
            "call_type": call.call_type,
            "conversation_id": conversation_id,
        }
    })
    return success_response({"id": call.id, "status": "ongoing", "call_type": call.call_type}, "Call started")

@router.post("/{call_id}/end")
async def end_call(call_id: int, payload: dict = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    call = db.query(CallHistory).filter_by(id=call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.caller_id != current_user.id and call.callee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not participant")
    status = (payload or {}).get("status", "ended")
    if status not in ("ended","rejected","missed"):
        status = "ended"
    call.status = status
    call.ended_at = datetime.now(timezone.utc)
    if call.started_at:
        call.duration_seconds = int((call.ended_at - call.started_at).total_seconds())
    db.commit()
    # notify other party
    from app.websocket.manager import manager
    other = call.callee_id if current_user.id == call.caller_id else call.caller_id
    if other:
        await manager.send_to_user(other, {"type": "call.ended", "payload": {"id": call.id, "status": status}})
    return success_response({"id": call.id, "status": status, "duration": call.duration_seconds}, "Call ended")

@router.post("/{call_id}/accept")
async def accept_call(call_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    call = db.query(CallHistory).filter_by(id=call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.callee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only callee can accept")
    call.status = "ongoing"
    db.commit()
    from app.websocket.manager import manager
    await manager.send_to_user(call.caller_id, {"type": "call.accepted", "payload": {"id": call.id}})
    return success_response({"id": call.id}, "Accepted")

@router.post("/{call_id}/reject")
async def reject_call(call_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await end_call(call_id, {"status": "rejected"}, db, current_user)
