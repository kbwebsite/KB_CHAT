"""In-app feedback (Settings → Help and feedback).

Any signed-in user may submit (bug / idea / other, 1–2000 chars, with
an optional app version for context). Reading and marking reviewed is
admin-only and powers the Feedback tab in /admin.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.feedback import Feedback, FEEDBACK_CATEGORIES
from app.schemas.common import success_response

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


def _to_dict(db: Session, f: Feedback):
    u = db.query(User).filter_by(id=f.user_id).first()
    return {
        "id": f.id,
        "user_id": f.user_id,
        "username": u.username if u else None,
        "display_name": u.display_name if u else None,
        "category": f.category,
        "message": f.message,
        "app_version": f.app_version,
        "status": f.status,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


@router.post("")
def submit_feedback(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = str(payload.get("category") or "bug").strip().lower()
    if category not in FEEDBACK_CATEGORIES:
        raise HTTPException(
            status_code=400, detail="category must be bug, idea or other"
        )
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Tell us a little more first")
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Keep it under 2000 characters")
    app_version = (payload.get("app_version") or "").strip()[:50] or None
    row = Feedback(
        user_id=current_user.id,
        category=category,
        message=message,
        app_version=app_version,
        status="new",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return success_response({"id": row.id}, "Thanks — feedback received")


@router.get("")
def list_feedback(
    status: str = "new",
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.api.moderation import is_admin_user

    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    if status not in ("new", "reviewed", "all"):
        raise HTTPException(status_code=400, detail="Invalid status filter")
    q = db.query(Feedback).order_by(desc(Feedback.id))
    if status != "all":
        q = q.filter_by(status=status)
    rows = q.limit(max(1, min(limit, 200))).all()
    return success_response([_to_dict(db, r) for r in rows])


@router.post("/{feedback_id}/reviewed")
def mark_reviewed(
    feedback_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.api.moderation import is_admin_user

    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    row = db.query(Feedback).filter_by(id=feedback_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    reviewed = bool((payload or {}).get("reviewed", True))
    row.status = "reviewed" if reviewed else "new"
    db.commit()
    db.refresh(row)
    return success_response(_to_dict(db, row), "Updated")
