from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone, timedelta
from typing import Optional
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.status import Status, StatusViewer
from app.schemas.common import success_response
import os
import uuid

router = APIRouter(prefix="/api/status", tags=["status"])

def _now_aware():
    return datetime.now(timezone.utc)

def _make_aware(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def is_expired(s: Status):
    now = _now_aware()
    exp = _make_aware(s.expires_at)
    created = _make_aware(s.created_at)
    if exp and exp < now:
        return True
    if created and (now - created) > timedelta(hours=24):
        return True
    return False

def status_to_dict(s: Status, db: Session, current_user_id: int, include_viewers=False):
    user = db.query(User).filter_by(id=s.user_id).first()
    viewers = []
    if include_viewers:
        viewers = [{"viewer_id": v.viewer_id, "viewed_at": v.viewed_at.isoformat() if v.viewed_at else None} for v in s.viewers]
    viewed = db.query(StatusViewer).filter_by(status_id=s.id, viewer_id=current_user_id).first() is not None
    return {
        "id": s.id,
        "user_id": s.user_id,
        "username": user.username if user else "unknown",
        "display_name": user.display_name if user else "Unknown",
        "avatar_url": user.avatar_url if user else None,
        "content": s.content,
        "media_url": s.media_url,
        "media_type": s.media_type,
        "background": s.background,
        "caption": s.caption,
        "privacy": s.privacy,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        "viewed": viewed,
        "is_own": s.user_id == current_user_id,
        "view_count": len(s.viewers),
        "viewers": viewers if include_viewers else None,
    }

@router.post("")
def create_status(
    content: Optional[str] = Form(None),
    media_type: str = Form("text"),
    background: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    privacy: str = Form("contacts"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not content and media_type == "text":
        raise HTTPException(status_code=400, detail="Content required for text status")
    # privacy validation
    if privacy not in ("contacts", "selected", "nobody"):
        privacy = "contacts"
    s = Status(
        user_id=current_user.id,
        content=content,
        media_type=media_type if media_type in ("text","image","video") else "text",
        background=background,
        caption=caption,
        privacy=privacy,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24)
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return success_response(status_to_dict(s, db, current_user.id), "Status created")

@router.post("/with-media")
def create_status_with_media(
    media_type: str = Form(...),
    caption: Optional[str] = Form(None),
    privacy: str = Form("contacts"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # validate file
    from app.database.config import settings
    from app.utils.helpers import sanitize_filename, generate_stored_filename
    import aiofiles
    import pathlib
    # read file
    content = file.file.read()
    size = len(content)
    if size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    safe = sanitize_filename(file.filename or "status")
    ext = os.path.splitext(safe.lower())[1]
    if media_type == "image" and ext not in (".jpg",".jpeg",".png",".webp",".gif"):
        raise HTTPException(status_code=400, detail="Invalid image type")
    if media_type == "video" and ext not in (".mp4",".webm",".mov"):
        raise HTTPException(status_code=400, detail="Invalid video type")
    stored = generate_stored_filename(safe)
    upload_dir = settings.upload_dir_abs
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, stored)
    with open(file_path, "wb") as f:
        f.write(content)
    media_url = f"/api/uploads/file/{stored}"
    s = Status(
        user_id=current_user.id,
        media_url=media_url,
        media_type=media_type,
        caption=caption,
        privacy=privacy if privacy in ("contacts","selected","nobody") else "contacts",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24)
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return success_response(status_to_dict(s, db, current_user.id), "Status created")

@router.get("/feed")
def get_feed(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # get all non-expired, not deleted statuses from other users, plus own
    all_statuses = db.query(Status).filter(Status.is_deleted==False).order_by(desc(Status.created_at)).all()
    # filter expired and privacy
    my_id=current_user.id
    recent=[]
    viewed=[]
    my_statuses=[]
    for s in all_statuses:
        if is_expired(s):
            continue
        if s.privacy == "nobody" and s.user_id != my_id:
            continue
        # For now, selected/nobody not fully enforced; treat contacts as all authenticated
        d=status_to_dict(s, db, my_id)
        if s.user_id == my_id:
            my_statuses.append(d)
        else:
            if d["viewed"]:
                viewed.append(d)
            else:
                recent.append(d)
    return success_response({"my_status": my_statuses, "recent": recent, "viewed": viewed})

@router.get("/my")
def get_my(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    statuses = db.query(Status).filter_by(user_id=current_user.id, is_deleted=False).order_by(desc(Status.created_at)).all()
    result=[status_to_dict(s, db, current_user.id, include_viewers=True) for s in statuses if not is_expired(s)]
    return success_response(result)

@router.delete("/{status_id}")
def delete_status(status_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s=db.query(Status).filter_by(id=status_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    if s.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    s.is_deleted=True
    db.commit()
    return success_response(None, "Deleted")

@router.post("/{status_id}/view")
def view_status(status_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s=db.query(Status).filter_by(id=status_id).first()
    if not s or s.is_deleted or is_expired(s):
        raise HTTPException(status_code=404, detail="Not found")
    if s.user_id == current_user.id:
        return success_response(None, "Own status")
    existing=db.query(StatusViewer).filter_by(status_id=status_id, viewer_id=current_user.id).first()
    if not existing:
        v=StatusViewer(status_id=status_id, viewer_id=current_user.id)
        db.add(v)
        db.commit()
    return success_response(None, "Viewed")

@router.get("/{status_id}/viewers")
def get_viewers(status_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s=db.query(Status).filter_by(id=status_id).first()
    if not s or s.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    viewers=db.query(StatusViewer).filter_by(status_id=status_id).all()
    result=[]
    for v in viewers:
        u=db.query(User).filter_by(id=v.viewer_id).first()
        result.append({"viewer_id": v.viewer_id, "username": u.username if u else "unknown", "display_name": u.display_name if u else "Unknown", "avatar_url": u.avatar_url if u else None, "viewed_at": v.viewed_at.isoformat() if v.viewed_at else None})
    return success_response(result)
