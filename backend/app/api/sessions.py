from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.session import UserSession
from app.schemas.common import success_response

router = APIRouter(prefix="/api", tags=["sessions"])

@router.get("/sessions")
def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = db.query(UserSession).filter_by(user_id=current_user.id).order_by(desc(UserSession.last_active)).all()
    return success_response([{
        "id": s.id, "device_info": s.device_info, "browser_info": s.browser_info,
        "is_current": s.is_current, "last_active": s.last_active.isoformat() if s.last_active else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    } for s in sessions])

@router.post("/sessions/current")
def mark_current_session(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Mark all others as not current
    db.query(UserSession).filter_by(user_id=current_user.id).update({"is_current": False})
    device = payload.get("device_info", "Unknown")
    browser = payload.get("browser_info", "Unknown")
    existing = db.query(UserSession).filter_by(user_id=current_user.id, device_info=device, browser_info=browser).first()
    if existing:
        existing.is_current = True
        existing.last_active = datetime.now(timezone.utc)
    else:
        db.add(UserSession(user_id=current_user.id, device_info=device, browser_info=browser, is_current=True))
    db.commit()
    return success_response(None, "Session updated")

@router.post("/sessions/logout-others")
def logout_other_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(UserSession).filter(UserSession.user_id == current_user.id, UserSession.is_current == False).delete()
    db.commit()
    return success_response(None, "Other sessions logged out")

@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(UserSession).filter_by(id=session_id, user_id=current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if s.is_current:
        raise HTTPException(status_code=400, detail="Cannot delete current session")
    db.delete(s)
    db.commit()
    return success_response(None, "Session deleted")
