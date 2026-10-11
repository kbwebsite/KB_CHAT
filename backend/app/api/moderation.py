"""Platform moderation queue (reports + admin user actions).

Any signed-in user may file a report; only admins may read or resolve.
Adminship is the `users.is_admin` flag (nullable, NULL reads as False so
old databases never 500) OR membership in the `ADMIN_EMAILS` env allowlist
(bootstrap path — no admin exists by default). Resolutions are recorded on
the report row (audit trail); reports are never deleted.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
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
        "ai_score": r.ai_score,
        "ai_label": r.ai_label,
        "ai_summary": r.ai_summary,
        "ai_analyzed_at": r.ai_analyzed_at.isoformat() if r.ai_analyzed_at else None,
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


@router.post("/reports/{report_id}/analyze")
async def analyze_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI triage assist: score the reported content 0-100 with a category
    and one-line rationale, stored on the row for the admin queue.
    Requires a live AI key (503 otherwise — never mock-judge anyone)."""
    require_admin(current_user)
    row = db.query(Report).filter_by(id=report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if not settings.AI_API_KEY:
        raise HTTPException(status_code=503, detail="AI key not configured")
    if row.target_type == "message":
        msg = db.query(Message).filter_by(id=row.target_id).first()
        if not msg or msg.is_deleted:
            raise HTTPException(status_code=404, detail="Reported message not found")
        if msg.is_encrypted or msg.view_once:
            raise HTTPException(status_code=400, detail="Cannot analyze sealed content")
        if msg.message_type != "text" or not (msg.content or "").strip():
            raise HTTPException(
                status_code=400, detail="Only text messages can be analyzed"
            )
        evidence = msg.content.strip()[:1000]
    elif row.target_type == "user":
        target = db.query(User).filter_by(id=row.target_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Reported user not found")
        recent = (
            db.query(Message.content)
            .filter(
                Message.sender_id == target.id,
                Message.is_deleted == False,  # noqa: E712
                Message.message_type == "text",
                Message.is_encrypted == False,  # noqa: E712
            )
            .order_by(Message.id.desc())
            .limit(5)
            .all()
        )
        evidence = "\n".join(f"- {(c[0] or '')[:200]}" for c in recent if c[0])
        if not evidence.strip():
            raise HTTPException(
                status_code=400, detail="No analyzable content from this user"
            )
    else:
        raise HTTPException(
            status_code=400, detail="Conversation reports need human review"
        )
    prompt = (
        "You are a chat-moderation triage assistant. Rate the reported content "
        "for policy risk. Reply with ONLY compact JSON, no other text: "
        '{"score": 0-100, "label": "safe|suspicious|spam|abusive|explicit|scam", '
        '"summary": "one short line"}.\n'
        f"Report reason: {row.reason}\nContent:\n{evidence[:1500]}"
    )
    try:
        from app.ai.provider import get_ai_provider

        provider = get_ai_provider()
        raw = await provider.chat([{"role": "user", "content": prompt}])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Analysis failed: {e}")
    import json as _json
    import re as _re

    score, label, summary = None, None, None
    try:
        m = _re.search(r"\{.*\}", raw or "", _re.DOTALL)
        data = _json.loads(m.group(0)) if m else {}
        score = int(data.get("score"))
        label = str(data.get("label") or "").lower()
        summary = str(data.get("summary") or "")[:300]
    except Exception:
        pass
    if (
        score is None
        or not (0 <= score <= 100)
        or label
        not in (
            "safe",
            "suspicious",
            "spam",
            "abusive",
            "explicit",
            "scam",
        )
    ):
        raise HTTPException(status_code=502, detail="Analysis returned no usable score")
    row.ai_score = score
    row.ai_label = label
    row.ai_summary = summary or None
    row.ai_analyzed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return success_response(_report_to_dict(db, row), "Analysis stored")


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


@router.get("/stats")
def platform_stats(
    days: int = 14,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Platform overview for the admin console (counts + 14-day series).

    All queries are bounded aggregates; no message content leaves the
    server (only counts and per-day buckets).
    """
    require_admin(current_user)
    days = max(1, min(int(days or 14), 60))
    # Naive UTC for SQL bounds (SQLite stores naive datetimes; Postgres
    # compares fine against naive values for these overview buckets).
    now = datetime.utcnow()
    since = now - timedelta(days=days)

    def day_series(day_col):
        rows = (
            db.query(func.date(day_col).label("day"), func.count().label("n"))
            .filter(day_col >= since)
            .group_by(func.date(day_col))
            .all()
        )
        # func.date yields str on SQLite, date on Postgres — normalize.
        out = {str(r.day): r.n for r in rows}
        return [
            {
                "date": (since + timedelta(days=i)).date().isoformat(),
                "count": out.get((since + timedelta(days=i)).date().isoformat(), 0),
            }
            for i in range(days)
        ]

    reasons = (
        db.query(Report.reason, func.count().label("n")).group_by(Report.reason).all()
    )
    return success_response(
        {
            "users": {
                "total": db.query(func.count(User.id)).scalar() or 0,
                "active": db.query(func.count(User.id))
                .filter(User.is_active.is_(True))
                .scalar()
                or 0,
                "new_7d": db.query(func.count(User.id))
                .filter(User.created_at >= now - timedelta(days=7))
                .scalar()
                or 0,
            },
            "messages": {
                "total": db.query(func.count(Message.id)).scalar() or 0,
                "per_day": day_series(Message.created_at),
            },
            "conversations": {
                "total": db.query(func.count(Conversation.id)).scalar() or 0,
                "groups": db.query(func.count(Conversation.id))
                .filter(Conversation.is_group.is_(True))
                .scalar()
                or 0,
            },
            "reports": {
                "open": db.query(func.count(Report.id))
                .filter_by(status="open")
                .scalar()
                or 0,
                "resolved": db.query(func.count(Report.id))
                .filter(Report.status != "open")
                .scalar()
                or 0,
                "by_reason": [{"reason": r, "count": n} for r, n in reasons],
            },
        }
    )
