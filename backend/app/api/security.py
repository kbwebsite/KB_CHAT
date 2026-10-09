"""Security alerts: new-device sign-in history.

Every interactive login funnels through ``maybe_security_alert`` (called
from both token-issuance paths in ``api/auth.py``). A User-Agent never
seen for this account creates one alert; repeat logins from known
devices stay silent. Listing/mark-seen below powers the settings
"Security notifications" section. Alerts never block login.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.security_alert import SecurityAlert
from app.schemas.common import success_response

router = APIRouter(prefix="/api/security", tags=["security"])


def maybe_security_alert(db: Session, user: User, request=None) -> None:
    """Record a first-seen device. Best-effort: never raises."""
    try:
        from app.api.session_auth import client_ip, device_info

        device = device_info(request) if request is not None else None
        if not device:
            return
        known = (
            db.query(SecurityAlert).filter_by(user_id=user.id, device=device).first()
            is not None
        )
        if known:
            return
        ip = client_ip(request) if request is not None else None
        db.add(
            SecurityAlert(
                user_id=user.id,
                event="new_login",
                ip=ip,
                device=device,
            )
        )
        db.commit()
    except Exception as e:
        print(f"[security] alert record failed: {e}")


def _alert_to_dict(a: SecurityAlert):
    return {
        "id": a.id,
        "event": a.event,
        "ip": a.ip,
        "device": a.device,
        "seen": a.seen_at is not None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.get("/alerts")
def list_alerts(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(SecurityAlert)
        .filter_by(user_id=current_user.id)
        .order_by(desc(SecurityAlert.id))
        .limit(max(1, min(limit, 100)))
        .all()
    )
    unseen = (
        db.query(SecurityAlert).filter_by(user_id=current_user.id, seen_at=None).count()
    )
    return success_response(
        {"alerts": [_alert_to_dict(a) for a in rows], "unseen": unseen}
    )


@router.post("/alerts/seen")
def mark_seen(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(SecurityAlert).filter_by(user_id=current_user.id, seen_at=None).update(
        {"seen_at": datetime.now(timezone.utc)}
    )
    db.commit()
    return success_response(None, "All caught up")
