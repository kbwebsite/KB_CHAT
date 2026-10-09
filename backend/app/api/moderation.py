"""Platform moderation queue (reports + admin user actions).

Any signed-in user may file a report; only admins may read or resolve.
Adminship is the `users.is_admin` flag (nullable, NULL reads as False so
old databases never 500) OR membership in the `ADMIN_EMAILS` env allowlist
(bootstrap path — no admin exists by default). Resolutions are recorded on
the report row (audit trail); reports are never deleted.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.config import settings
from app.database.connection import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.report import REPORT_ACTIONS, REPORT_REASONS, Report
from app.models.user import User
from app.schemas.common import success_response

router = APIRouter(prefix="/api/moderation", tags=["moderation"])


def is_admin_user(user: User) -> bool:
    """True for flagged admins or env-allowlisted bootstrap emails."""
    try:
        if bool(getattr(user, "is_admin", False)):
            return True
    except Exception:
        pass
    try:
        allowed = {
            e.strip().lower()
            for e in (settings.ADMIN_EMAILS or "").split(",")
            if e.strip()
        }
        return bool(user.email) and user.email.lower() in allowed
    except Exception:
        return False


def require_admin(user: User) -> None:
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin privileges required")


def _target_summary(db: Session, target_type: str, target_id: int) -> dict:
    if target_type == "message":
        msg = db.query(Message).filter_by(id=target_id).first()
        if not msg:
            return {}
        sender = db.query(User).filter_by(id=msg.sender_id).first()
        return {
            "message_id": msg.id,
            "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id,
            "sender_username": sender.username if sender else None,
            "snippet": (msg.content or "")[:140],
            "is_deleted": bool(msg.is_deleted),
        }
    if target_type == "user":
        u = db.query(User).filter_by(id=target_id).first()
        if not u:
            return {}
        return {
            "user_id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "is_active": bool(u.is_active),
        }
    conv = db.query(Conversation).filter_by(id=target_id).first()
    if not conv:
        return {}
    return {
        "conversation_id": conv.id,
        "is_group": bool(conv.is_group),
    }


def _report_to_dict(db: Session, r: Report) -> dict:
    reporter = db.query(User).filter_by(id=r.reporter_id).first()
    return {
        "id": r.id,
        "reporter_id": r.reporter_id,
        "reporter_username": reporter.username if reporter else None,
        "target_type": r.target_type,
        "target_id": r.target_id,
        "target": _target_summary(db, r.target_type, r.target_id),
        "reason": r.reason,
        "details": r.details,
        "status": r.status,
        "action_taken": r.action_taken,
        "resolved_by": r.resolved_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
    }


def _reported_user_id(db: Session, row: Report) -> int | None:
    """Author account behind a user/message report (conversation -> None)."""
    if row.target_type == "user":
        return row.target_id
    if row.target_type == "message":
        msg = db.query(Message).filter_by(id=row.target_id).first()
        return msg.sender_id if msg else None
    return None


@router.post("/reports")
def create_report(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_type = str(payload.get("target_type") or "").strip().lower()
    target_id = payload.get("target_id")
    reason = str(payload.get("reason") or "").strip().lower()
    details = payload.get("details")
    if target_type not in ("message", "user", "conversation"):
        raise HTTPException(status_code=400, detail="Invalid target type")
    if not isinstance(target_id, int):
        raise HTTPException(status_code=400, detail="Invalid target id")
    if reason not in REPORT_REASONS:
        raise HTTPException(status_code=400, detail="Invalid reason")
    if _target_summary(db, target_type, target_id) == {}:
        raise HTTPException(status_code=404, detail="Report target not found")
    row = Report(
        reporter_id=current_user.id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        details=str(details)[:1000] if details else None,
        status="open",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return success_response(_report_to_dict(db, row), "Report submitted")


@router.get("/reports")
def list_reports(
    status: str = "open",
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    if status not in ("open", "resolved", "all"):
        raise HTTPException(status_code=400, detail="Invalid status filter")
    limit = max(1, min(int(limit or 50), 200))
    q = db.query(Report).order_by(Report.id.desc())
    if status != "all":
        q = q.filter_by(status="open" if status == "open" else "resolved")
    rows = q.limit(limit).all()
    return success_response([_report_to_dict(db, r) for r in rows])


@router.post("/reports/{report_id}/resolve")
def resolve_report(
    report_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    action = str((payload or {}).get("action") or "").strip().lower()
    if action not in REPORT_ACTIONS:
        raise HTTPException(status_code=400, detail="Invalid action")
    row = db.query(Report).filter_by(id=report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row.status != "open":
        raise HTTPException(status_code=400, detail="Report already resolved")
    now = datetime.now(timezone.utc)
    if action == "dismissed":
        pass
    elif action == "message_deleted":
        if row.target_type != "message":
            raise HTTPException(
                status_code=400, detail="message_deleted needs a message report"
            )
        msg = db.query(Message).filter_by(id=row.target_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Reported message not found")
        msg.is_deleted = True
    elif action == "user_deactivated":
        uid = _reported_user_id(db, row)
        target = db.query(User).filter_by(id=uid).first() if uid else None
        if not target:
            raise HTTPException(status_code=404, detail="Reported user not found")
        if target.id == current_user.id or is_admin_user(target):
            raise HTTPException(
                status_code=400, detail="Cannot deactivate this account"
            )
        target.is_active = False
    row.status = "resolved"
    row.action_taken = action
    row.resolved_by = current_user.id
    row.resolved_at = now
    db.commit()
    db.refresh(row)
    return success_response(_report_to_dict(db, row), f"Report {action}")


def _user_admin_view(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "display_name": u.display_name,
        "is_active": bool(u.is_active),
        "is_admin": is_admin_user(u),
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/users")
def list_users(
    search: str = "",
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    limit = max(1, min(int(limit or 30), 100))
    q = db.query(User).order_by(User.id.desc())
    term = (search or "").strip().lower()
    if term:
        like = f"%{term}%"
        q = q.filter(
            (User.username.ilike(like))
            | (User.email.ilike(like))
            | (User.display_name.ilike(like))
        )
    return success_response([_user_admin_view(u) for u in q.limit(limit).all()])


@router.post("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    target = db.query(User).filter_by(id=user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id or is_admin_user(target):
        raise HTTPException(status_code=400, detail="Cannot deactivate this account")
    target.is_active = False
    db.commit()
    return success_response(_user_admin_view(target), "User deactivated")


@router.post("/users/{user_id}/reactivate")
def reactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    target = db.query(User).filter_by(id=user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_active = True
    db.commit()
    return success_response(_user_admin_view(target), "User reactivated")
