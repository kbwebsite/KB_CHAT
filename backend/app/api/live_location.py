"""Live location sharing: start / update / stop / list active sessions.

Sessions are conversation-scoped. Positions fan out over the existing
conversation WS channel as ``location.live.start|update|stop`` so every
member's map moves in real time. Expiry is evaluated on read; no sweeper.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.live_location import LiveLocationSession
from app.schemas.common import success_response
from app.services.errors import service_route

router = APIRouter(prefix="/api/live-location", tags=["live-location"])

ALLOWED_MINUTES = (15, 60, 480)
UPDATE_THROTTLE_SECONDS = 5


def _now():
    return datetime.now(timezone.utc)


def _as_aware(dt):
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _require_member(db: Session, conv_id: int, user_id: int) -> Conversation:
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    mem = (
        db.query(ConversationMember)
        .filter_by(conversation_id=conv_id, user_id=user_id)
        .first()
    )
    if not mem:
        raise HTTPException(status_code=403, detail="Not a participant")
    return conv


def _session_to_dict(db: Session, s: LiveLocationSession):
    u = db.query(User).filter_by(id=s.user_id).first()
    now = _now()
    exp = _as_aware(s.expires_at)
    active = s.stopped_at is None and exp is not None and exp > now
    return {
        "id": s.id,
        "conversation_id": s.conversation_id,
        "user_id": s.user_id,
        "username": u.username if u else None,
        "display_name": u.display_name if u else None,
        "avatar_url": u.avatar_url if u else None,
        "lat": s.lat,
        "lon": s.lon,
        "accuracy": s.accuracy,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        "stopped_at": s.stopped_at.isoformat() if s.stopped_at else None,
        "active": active,
    }


def _broadcast(db: Session, conv_id: int, kind: str, s: LiveLocationSession):
    from app.api.messages import _broadcast_soon, _member_ids

    _broadcast_soon(
        conv_id,
        {"type": kind, "payload": _session_to_dict(db, s)},
        member_ids=_member_ids(db, conv_id),
    )


def _get_owned(db: Session, session_id: int, user_id: int) -> LiveLocationSession:
    s = db.query(LiveLocationSession).filter_by(id=session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Live session not found")
    if s.user_id != user_id:
        raise HTTPException(
            status_code=403, detail="Only the sharer controls this session"
        )
    return s


def _valid_coords(lat, lon):
    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon


@router.post("/start")
@service_route
def start_session(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        conv_id = int(payload.get("conversation_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="conversation_id required")
    _require_member(db, conv_id, current_user.id)
    coords = _valid_coords(payload.get("lat"), payload.get("lon"))
    if not coords:
        raise HTTPException(status_code=400, detail="Valid lat/lon required")
    try:
        minutes = int(payload.get("duration_minutes") or 60)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid duration")
    if minutes not in ALLOWED_MINUTES:
        raise HTTPException(
            status_code=400, detail="Duration must be 15, 60 or 480 minutes"
        )
    lat, lon = coords
    accuracy = payload.get("accuracy")
    try:
        accuracy = float(accuracy) if accuracy is not None else None
    except (TypeError, ValueError):
        accuracy = None
    now = _now()
    # One live share per user per conversation: stop any previous active one.
    prev = (
        db.query(LiveLocationSession)
        .filter_by(conversation_id=conv_id, user_id=current_user.id, stopped_at=None)
        .filter(LiveLocationSession.expires_at > now)
        .all()
    )
    for p in prev:
        p.stopped_at = now
    s = LiveLocationSession(
        conversation_id=conv_id,
        user_id=current_user.id,
        lat=lat,
        lon=lon,
        accuracy=accuracy,
        expires_at=now + timedelta(minutes=minutes),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    _broadcast(db, conv_id, "location.live.start", s)
    return success_response(_session_to_dict(db, s), "Live location started")


@router.post("/{session_id}/update")
@service_route
def update_session(
    session_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = _get_owned(db, session_id, current_user.id)
    if s.stopped_at is not None or _as_aware(s.expires_at) <= _now():
        raise HTTPException(status_code=410, detail="Live session ended")
    coords = _valid_coords(payload.get("lat"), payload.get("lon"))
    if not coords:
        raise HTTPException(status_code=400, detail="Valid lat/lon required")
    updated = _as_aware(s.updated_at) or _as_aware(s.started_at) or _now()
    if (_now() - updated).total_seconds() < UPDATE_THROTTLE_SECONDS:
        return success_response(_session_to_dict(db, s), "Update throttled")
    s.lat, s.lon = coords
    try:
        s.accuracy = (
            float(payload.get("accuracy"))
            if payload.get("accuracy") is not None
            else s.accuracy
        )
    except (TypeError, ValueError):
        pass
    db.commit()
    db.refresh(s)
    _broadcast(db, s.conversation_id, "location.live.update", s)
    return success_response(_session_to_dict(db, s), "Location updated")


@router.post("/{session_id}/stop")
@service_route
def stop_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = _get_owned(db, session_id, current_user.id)
    if s.stopped_at is None:
        s.stopped_at = _now()
        db.commit()
        db.refresh(s)
        _broadcast(db, s.conversation_id, "location.live.stop", s)
    return success_response(_session_to_dict(db, s), "Live location stopped")


@router.get("/by-conversation/{conv_id}")
def active_sessions(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_member(db, conv_id, current_user.id)
    rows = (
        db.query(LiveLocationSession)
        .filter_by(conversation_id=conv_id, stopped_at=None)
        .filter(LiveLocationSession.expires_at > _now())
        .order_by(LiveLocationSession.id.desc())
        .all()
    )
    return success_response([_session_to_dict(db, s) for s in rows])


@router.get("/{session_id}")
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(LiveLocationSession).filter_by(id=session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Live session not found")
    _require_member(db, s.conversation_id, current_user.id)
    return success_response(_session_to_dict(db, s))
