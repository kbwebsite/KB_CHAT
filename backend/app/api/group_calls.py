"""Group calls: conversation-scoped voice/video rooms (mesh WebRTC).

The roster is live over WS (``group_call.join/leave/mute`` relayed by the
chat socket); this API owns the room lifecycle: start (invite fan-out),
end (chat note + ``group_call.end`` fan-out) and the active-room query
that powers ringing banners and late join. Any conversation member may
start, join or end — a stuck room can never strand the group.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.group_call import GroupCallSession
from app.models.message import Message
from app.schemas.common import success_response

router = APIRouter(prefix="/api/group-calls", tags=["group-calls"])

# Rooms older than this with no explicit end are treated as dead (e.g. the
# starter's app died mid-call). No sweeper: evaluated on read.
STALE_AFTER_HOURS = 4


def _now():
    return datetime.now(timezone.utc)


def _as_aware(dt):
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _is_live(s: GroupCallSession) -> bool:
    if s.status != "ongoing":
        return False
    started = _as_aware(s.started_at) or _now()
    return (_now() - started).total_seconds() < STALE_AFTER_HOURS * 3600


def _require_member(db: Session, conv_id: int, user_id: int) -> Conversation:
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not conv.is_group:
        raise HTTPException(status_code=400, detail="Group calls need a group chat")
    mem = (
        db.query(ConversationMember)
        .filter_by(conversation_id=conv_id, user_id=user_id)
        .first()
    )
    if not mem:
        raise HTTPException(status_code=403, detail="Not a participant")
    return conv


def _session_to_dict(db: Session, s: GroupCallSession):
    u = db.query(User).filter_by(id=s.started_by).first() if s.started_by else None
    return {
        "id": s.id,
        "conversation_id": s.conversation_id,
        "started_by": s.started_by,
        "starter_username": u.username if u else None,
        "starter_display_name": u.display_name if u else None,
        "call_type": s.call_type,
        "status": s.status,
        "active": _is_live(s),
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
    }


def _member_ids(db: Session, conv_id: int):
    return [
        m.user_id
        for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()
    ]


@router.post("/start")
async def start_group_call(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        conv_id = int(payload.get("conversation_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="conversation_id required")
    conv = _require_member(db, conv_id, current_user.id)
    call_type = payload.get("call_type") or "voice"
    if call_type not in ("voice", "video"):
        call_type = "voice"
    existing = (
        db.query(GroupCallSession)
        .filter_by(conversation_id=conv_id, status="ongoing")
        .order_by(desc(GroupCallSession.id))
        .first()
    )
    if existing and _is_live(existing):
        return success_response(_session_to_dict(db, existing), "Already in a call")
    s = GroupCallSession(
        conversation_id=conv_id,
        started_by=current_user.id,
        call_type=call_type,
        status="ongoing",
        started_at=_now(),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    from app.websocket.manager import manager

    await manager.broadcast_to_conversation(
        conv_id,
        {"type": "group_call.invite", "payload": _session_to_dict(db, s)},
        member_ids=_member_ids(db, conv_id),
    )
    return success_response(_session_to_dict(db, s), "Group call started")


@router.post("/{session_id}/end")
async def end_group_call(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(GroupCallSession).filter_by(id=session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Call not found")
    _require_member(db, s.conversation_id, current_user.id)
    if s.status == "ongoing":
        s.status = "ended"
        s.ended_at = _now()
        db.commit()
    db.refresh(s)
    # Visible note in the group chat.
    try:
        started = _as_aware(s.started_at) or _now()
        secs = max(0, int((_now() - started).total_seconds()))
        mm, ss = divmod(secs, 60)
        kind = "Video" if s.call_type == "video" else "Voice"
        text = f"📞 Group {kind.lower()} call ended • {mm}:{ss:02d}"
        note = Message(
            conversation_id=s.conversation_id,
            sender_id=current_user.id,
            content=text,
            message_type="text",
        )
        db.add(note)
        db.commit()
        db.refresh(note)
        from app.api.messages import _member_ids as _mids
        from app.api.messages import _broadcast_soon

        _broadcast_soon(
            s.conversation_id,
            {
                "type": "message.new",
                "payload": {
                    "id": note.id,
                    "conversation_id": s.conversation_id,
                    "sender_id": current_user.id,
                    "sender_username": current_user.username,
                    "sender_display_name": current_user.display_name,
                    "sender_avatar": current_user.avatar_url,
                    "content": text,
                    "message_type": "text",
                    "is_deleted": False,
                    "is_edited": False,
                    "created_at": note.created_at.isoformat()
                    if note.created_at
                    else None,
                    "attachments": [],
                    "reactions": [],
                    "status": "sent",
                },
            },
            member_ids=_mids(db, s.conversation_id),
        )
    except Exception as e:
        print(f"[group-calls] end note failed: {e}")
    from app.websocket.manager import manager

    await manager.broadcast_to_conversation(
        s.conversation_id,
        {"type": "group_call.end", "payload": _session_to_dict(db, s)},
        member_ids=_member_ids(db, s.conversation_id),
    )
    return success_response(_session_to_dict(db, s), "Group call ended")


@router.get("/active")
def active_call(
    conversation_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        conv_id = int(conversation_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="conversation_id required")
    _require_member(db, conv_id, current_user.id)
    s = (
        db.query(GroupCallSession)
        .filter_by(conversation_id=conv_id, status="ongoing")
        .order_by(desc(GroupCallSession.id))
        .first()
    )
    if not s or not _is_live(s):
        return success_response(None)
    return success_response(_session_to_dict(db, s))
