from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.status import Status, StatusViewer
from app.models.highlight import StatusHighlight, StatusHighlightItem
from app.schemas.common import success_response

router = APIRouter(prefix="/api/status", tags=["status-highlights"])

def _highlight_to_dict(db: Session, h: StatusHighlight):
    items = db.query(StatusHighlightItem).filter_by(highlight_id=h.id).order_by(StatusHighlightItem.position).all()
    statuses = []
    for item in items:
        s = db.query(Status).filter_by(id=item.status_id).first()
        if s:
            statuses.append({
                "id": s.id, "user_id": s.user_id, "content": s.content, "media_type": s.media_type,
                "media_url": s.media_url, "background": s.background, "privacy": s.privacy,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            })
    cover = None
    if h.cover_status_id:
        cs = db.query(Status).filter_by(id=h.cover_status_id).first()
        if cs:
            cover = cs.media_url or cs.content
    return {
        "id": h.id, "title": h.title, "cover": cover,
        "status_count": len(statuses), "statuses": statuses,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    }

@router.get("/highlights")
def list_highlights(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    highlights = db.query(StatusHighlight).filter_by(user_id=current_user.id).order_by(StatusHighlight.position).all()
    return success_response([_highlight_to_dict(db, h) for h in highlights])

@router.post("/highlights")
def create_highlight(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    title = payload.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title required")
    h = StatusHighlight(user_id=current_user.id, title=title)
    db.add(h)
    db.commit()
    db.refresh(h)
    return success_response(_highlight_to_dict(db, h), "Highlight created")

@router.post("/highlights/{highlight_id}/items")
def add_highlight_item(highlight_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    h = db.query(StatusHighlight).filter_by(id=highlight_id, user_id=current_user.id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Highlight not found")
    status_id = payload.get("status_id")
    if not status_id:
        raise HTTPException(status_code=400, detail="status_id required")
    s = db.query(Status).filter_by(id=status_id, user_id=current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Status not found")
    existing = db.query(StatusHighlightItem).filter_by(highlight_id=highlight_id, status_id=status_id).first()
    if existing:
        return success_response(_highlight_to_dict(db, h), "Already in highlight")
    max_pos = db.query(StatusHighlightItem).filter_by(highlight_id=highlight_id).count()
    item = StatusHighlightItem(highlight_id=highlight_id, status_id=status_id, position=max_pos)
    db.add(item)
    db.commit()
    return success_response(_highlight_to_dict(db, h), "Added to highlight")

@router.delete("/highlights/{highlight_id}")
def delete_highlight(highlight_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    h = db.query(StatusHighlight).filter_by(id=highlight_id, user_id=current_user.id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Highlight not found")
    db.delete(h)
    db.commit()
    return success_response(None, "Highlight deleted")

@router.delete("/highlights/{highlight_id}/items/{status_id}")
def remove_highlight_item(highlight_id: int, status_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    h = db.query(StatusHighlight).filter_by(id=highlight_id, user_id=current_user.id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Highlight not found")
    item = db.query(StatusHighlightItem).filter_by(highlight_id=highlight_id, status_id=status_id).first()
    if item:
        db.delete(item)
        db.commit()
    return success_response(_highlight_to_dict(db, h), "Removed from highlight")
