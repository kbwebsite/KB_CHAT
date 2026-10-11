"""Secret Santa draws for groups: deranged shuffle, secret DMs, reveal.

- POST /api/groups/{id}/secret-santa/draw (owner/admin): shuffle members,
  DM every giver their match, announce the draw (no names) in the group.
- GET /api/groups/{id}/secret-santa (member): current unwrapped draw +
  your own match (so you can re-check).
- POST /api/groups/{id}/secret-santa/reveal (owner/admin): post all
  pairs to the group. One unwrapped draw at a time; redraw replaces it.
"""

import json as _json
import random as _random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.secret_santa import SecretSantaDraw
from app.schemas.common import success_response
from app.services.errors import service_route

router = APIRouter(prefix="/api/groups", tags=["secret-santa"])

MIN_PLAYERS = 3


def _require_manager(db: Session, group_id: int, user_id: int) -> Conversation:
    conv = db.query(Conversation).filter_by(id=group_id, is_group=True).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    mem = (
        db.query(ConversationMember)
        .filter_by(conversation_id=group_id, user_id=user_id)
        .first()
    )
    if not mem or mem.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only admins can run the draw")
    return conv


def _require_member(db: Session, group_id: int, user_id: int) -> Conversation:
    conv = db.query(Conversation).filter_by(id=group_id, is_group=True).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    if (
        not db.query(ConversationMember)
        .filter_by(conversation_id=group_id, user_id=user_id)
        .first()
    ):
        raise HTTPException(status_code=403, detail="Not a member")
    return conv


def _names(db: Session, ids: list) -> dict:
    users = db.query(User).filter(User.id.in_(ids)).all() if ids else []
    return {u.id: (u.display_name or u.username) for u in users}


def _post_group(db: Session, conv_id: int, text: str) -> None:
    from app.api.messages import _broadcast_soon, _member_ids

    msg = Message(
        conversation_id=conv_id, sender_id=None, content=text, message_type="text"
    )
    db.add(msg)
    db.flush()
    _broadcast_soon(
        conv_id,
        {
            "type": "message.new",
            "payload": {
                "id": msg.id,
                "conversation_id": conv_id,
                "sender_id": None,
                "sender_username": None,
                "sender_display_name": None,
                "sender_avatar": None,
                "content": text,
                "message_type": "text",
                "is_deleted": False,
                "is_edited": False,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "attachments": [],
                "reactions": [],
                "status": "sent",
            },
        },
        member_ids=_member_ids(db, conv_id),
    )


def _dm(db: Session, me_id: int, other_id: int, text: str) -> None:
    from app.api.broadcasts import _get_or_create_dm
    from app.api.messages import _broadcast_soon, _member_ids

    conv = _get_or_create_dm(db, me_id, other_id)
    msg = Message(
        conversation_id=conv.id, sender_id=me_id, content=text, message_type="text"
    )
    db.add(msg)
    db.flush()
    me = db.query(User).filter_by(id=me_id).first()
    _broadcast_soon(
        conv.id,
        {
            "type": "message.new",
            "payload": {
                "id": msg.id,
                "conversation_id": conv.id,
                "sender_id": me_id,
                "sender_username": me.username if me else None,
                "sender_display_name": me.display_name if me else None,
                "sender_avatar": me.avatar_url if me else None,
                "content": text,
                "message_type": "text",
                "is_deleted": False,
                "is_edited": False,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "attachments": [],
                "reactions": [],
                "status": "sent",
            },
        },
        member_ids=_member_ids(db, conv.id),
    )


def _derange(ids: list) -> list | None:
    for _ in range(100):
        rec = ids[:]
        _random.shuffle(rec)
        if all(g != r for g, r in zip(ids, rec)):
            return rec
    return None


def _draw_to_dict(db: Session, d: SecretSantaDraw, viewer_id: int):
    pairs = []
    try:
        pairs = _json.loads(d.assignments or "[]")
    except Exception:
        pairs = []
    mine = next((r for g, r in pairs if g == viewer_id), None)
    names = _names(db, [viewer_id, mine] if mine else [viewer_id])
    return {
        "id": d.id,
        "conversation_id": d.conversation_id,
        "year": d.year,
        "status": d.status,
        "player_count": len(pairs),
        "budget": d.budget,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "my_receiver_id": mine,
        "my_receiver_name": names.get(mine) if mine else None,
    }


@router.post("/{group_id}/secret-santa/draw")
@service_route
def draw(
    group_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = _require_manager(db, group_id, current_user.id)
    member_ids = sorted(
        {
            m.user_id
            for m in db.query(ConversationMember)
            .filter_by(conversation_id=conv.id)
            .all()
        }
    )
    if len(member_ids) < MIN_PLAYERS:
        raise HTTPException(
            status_code=400, detail=f"Need at least {MIN_PLAYERS} players"
        )
    receivers = _derange(member_ids)
    if not receivers:
        raise HTTPException(
            status_code=400, detail="Could not shuffle fairly — try again"
        )
    budget = (payload.get("budget") or "").strip()[:200] or None
    # A redraw replaces the previous unwrapped draw.
    db.query(SecretSantaDraw).filter_by(
        conversation_id=conv.id, status="drawn"
    ).delete()
    draw = SecretSantaDraw(
        conversation_id=conv.id,
        year=datetime.now(timezone.utc).year,
        status="drawn",
        assignments=_json.dumps([[g, r] for g, r in zip(member_ids, receivers)]),
        budget=budget,
        created_by=current_user.id,
    )
    db.add(draw)
    db.flush()
    names = _names(db, member_ids)
    title = conv.title or "the group"
    for giver, receiver in zip(member_ids, receivers):
        if giver == current_user.id:
            continue  # the starter reads their own match from the draw status
        _dm(
            db,
            current_user.id,
            giver,
            f"🎅 Secret Santa ({title}): you're gifting **{names.get(receiver, 'someone')}**!"
            + (f" Budget: {budget}." if budget else "")
            + " Keep it secret 🤫",
        )
    _post_group(
        db,
        conv.id,
        f"🎅 Secret Santa draw done — {len(member_ids)} players! Check your DMs for your match 🤫"
        + (f" Budget: {budget}." if budget else ""),
    )
    db.commit()
    db.refresh(draw)
    return success_response(
        _draw_to_dict(db, draw, current_user.id), "Draw complete — matches sent"
    )


@router.get("/{group_id}/secret-santa")
def current_draw(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_member(db, group_id, current_user.id)
    d = (
        db.query(SecretSantaDraw)
        .filter_by(conversation_id=group_id, status="drawn")
        .order_by(SecretSantaDraw.id.desc())
        .first()
    )
    if not d:
        return success_response(None)
    return success_response(_draw_to_dict(db, d, current_user.id))


@router.post("/{group_id}/secret-santa/reveal")
@service_route
def reveal(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = _require_manager(db, group_id, current_user.id)
    d = (
        db.query(SecretSantaDraw)
        .filter_by(conversation_id=group_id, status="drawn")
        .order_by(SecretSantaDraw.id.desc())
        .first()
    )
    if not d:
        raise HTTPException(status_code=404, detail="No unwrapped draw")
    try:
        pairs = _json.loads(d.assignments or "[]")
    except Exception:
        pairs = []
    names = _names(db, [u for p in pairs for u in p])
    lines = [f"{names.get(g, '?')} → {names.get(r, '?')}" for g, r in pairs]
    _post_group(db, conv.id, "🎅 Secret Santa reveal!\n" + "\n".join(lines))
    d.status = "revealed"
    db.commit()
    db.refresh(d)
    return success_response(_draw_to_dict(db, d, current_user.id), "Matches revealed")
