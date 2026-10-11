"""Predictions: friendly wagers for groups (match winners, events…).

- POST /api/predictions {conversation_id, question, options[2-4], closes_at?}
- GET /api/predictions/by-conversation/{cid} (vote counts + my vote)
- POST /api/predictions/{id}/vote {option_index} (one vote, changeable
  until close)
- POST /api/predictions/{id}/resolve {result_index} (creator only):
  results posted to the chat, standings updated
- GET /api/predictions/by-conversation/{cid}/standings (correct picks
  per user across resolved predictions)
"""

import json as _json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.prediction import Prediction, PredictionVote
from app.schemas.common import success_response
from app.services.errors import service_route

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


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
    if (
        not db.query(ConversationMember)
        .filter_by(conversation_id=conv_id, user_id=user_id)
        .first()
    ):
        raise HTTPException(status_code=403, detail="Not a participant")
    return conv


def _options(p: Prediction) -> list:
    try:
        opts = _json.loads(p.options or "[]")
        return [str(o)[:60] for o in opts] if isinstance(opts, list) else []
    except Exception:
        return []


def _is_closed(p: Prediction) -> bool:
    if p.status != "open":
        return True
    if p.closes_at and (_as_aware(p.closes_at) or _now()) <= _now():
        return True
    return False


def _to_dict(db: Session, p: Prediction, viewer_id: int):
    opts = _options(p)
    counts = [0] * len(opts)
    for (idx,) in (
        db.query(PredictionVote.option_index).filter_by(prediction_id=p.id).all()
    ):
        if 0 <= idx < len(counts):
            counts[idx] += 1
    mine = (
        db.query(PredictionVote)
        .filter_by(prediction_id=p.id, user_id=viewer_id)
        .first()
    )
    creator = (
        db.query(User).filter_by(id=p.creator_id).first() if p.creator_id else None
    )
    return {
        "id": p.id,
        "conversation_id": p.conversation_id,
        "question": p.question,
        "options": opts,
        "vote_counts": counts,
        "total_votes": sum(counts),
        "my_vote": mine.option_index if mine else None,
        "creator_name": (creator.display_name or creator.username) if creator else None,
        "is_mine": p.creator_id == viewer_id,
        "status": "closed" if _is_closed(p) and p.status == "open" else p.status,
        "result_index": p.result_index,
        "closes_at": p.closes_at.isoformat() if p.closes_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _post_group(db: Session, conv_id: int, sender_id: int | None, text: str) -> None:
    from app.api.messages import _broadcast_soon, _member_ids

    sender = db.query(User).filter_by(id=sender_id).first() if sender_id else None
    msg = Message(
        conversation_id=conv_id, sender_id=sender_id, content=text, message_type="text"
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
                "sender_id": sender_id,
                "sender_username": sender.username if sender else None,
                "sender_display_name": sender.display_name if sender else None,
                "sender_avatar": sender.avatar_url if sender else None,
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


@router.post("")
@service_route
def create_prediction(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        conv_id = int(payload.get("conversation_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="conversation_id required")
    conv = _require_member(db, conv_id, current_user.id)
    question = (payload.get("question") or "").strip()[:200]
    if not question:
        raise HTTPException(status_code=400, detail="Question required")
    raw_opts = payload.get("options") or []
    opts = [str(o).strip()[:60] for o in raw_opts if str(o or "").strip()]
    if len(opts) < 2 or len(opts) > 4:
        raise HTTPException(status_code=400, detail="Give 2–4 options")
    closes_at = None
    if payload.get("closes_at"):
        try:
            closes_at = datetime.fromisoformat(str(payload.get("closes_at")))
            if closes_at.tzinfo is None:
                closes_at = closes_at.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid closes_at")
        if closes_at <= _now():
            raise HTTPException(
                status_code=400, detail="Close time must be in the future"
            )
    p = Prediction(
        conversation_id=conv.id,
        creator_id=current_user.id,
        question=question,
        options=_json.dumps(opts),
        closes_at=closes_at,
        status="open",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    _post_group(
        db,
        conv.id,
        current_user.id,
        f"🔮 Prediction: {question}\n"
        + "\n".join(f"{i + 1}. {o}" for i, o in enumerate(opts))
        + "\nVote from Predictions ☝️",
    )
    db.commit()
    return success_response(_to_dict(db, p, current_user.id), "Prediction created")


@router.get("/by-conversation/{conv_id}")
def list_predictions(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_member(db, conv_id, current_user.id)
    rows = (
        db.query(Prediction)
        .filter_by(conversation_id=conv_id)
        .order_by(desc(Prediction.id))
        .limit(20)
        .all()
    )
    return success_response([_to_dict(db, p, current_user.id) for p in rows])


@router.post("/{pred_id}/vote")
@service_route
def vote(
    pred_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Prediction).filter_by(id=pred_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Prediction not found")
    _require_member(db, p.conversation_id, current_user.id)
    if _is_closed(p):
        raise HTTPException(status_code=410, detail="Voting closed")
    try:
        idx = int(payload.get("option_index"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="option_index required")
    if not (0 <= idx < len(_options(p))):
        raise HTTPException(status_code=400, detail="Invalid option")
    v = (
        db.query(PredictionVote)
        .filter_by(prediction_id=p.id, user_id=current_user.id)
        .first()
    )
    if v:
        v.option_index = idx
    else:
        db.add(
            PredictionVote(
                prediction_id=p.id, user_id=current_user.id, option_index=idx
            )
        )
    db.commit()
    return success_response(_to_dict(db, p, current_user.id), "Vote counted")


@router.post("/{pred_id}/resolve")
@service_route
def resolve(
    pred_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.query(Prediction).filter_by(id=pred_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Prediction not found")
    _require_member(db, p.conversation_id, current_user.id)
    if p.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator resolves")
    if p.status != "open":
        raise HTTPException(status_code=400, detail="Already resolved")
    try:
        idx = int(payload.get("result_index"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="result_index required")
    opts = _options(p)
    if not (0 <= idx < len(opts)):
        raise HTTPException(status_code=400, detail="Invalid option")
    p.status = "resolved"
    p.result_index = idx
    db.commit()
    winners = (
        db.query(PredictionVote).filter_by(prediction_id=p.id, option_index=idx).all()
    )
    names = []
    if winners:
        uids = [w.user_id for w in winners]
        users = db.query(User).filter(User.id.in_(uids)).all()
        names = [(u.display_name or u.username) for u in users]
    total = db.query(PredictionVote).filter_by(prediction_id=p.id).count()
    _post_group(
        db,
        p.conversation_id,
        current_user.id,
        f"🔮 Result: {p.question}\nAnswer: **{opts[idx]}**"
        + (
            f"\n🏆 {', '.join(names[:5])} called it! ({len(winners)}/{total} correct)"
            if names
            else "\nNobody called it 😅"
        ),
    )
    db.commit()
    return success_response(_to_dict(db, p, current_user.id), "Resolved")


@router.get("/by-conversation/{conv_id}/standings")
def standings(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_member(db, conv_id, current_user.id)
    resolved = (
        db.query(Prediction).filter_by(conversation_id=conv_id, status="resolved").all()
    )
    table: dict = {}
    for p in resolved:
        if p.result_index is None:
            continue
        for v in db.query(PredictionVote).filter_by(prediction_id=p.id).all():
            e = table.setdefault(v.user_id, {"correct": 0, "total": 0})
            e["total"] += 1
            if v.option_index == p.result_index:
                e["correct"] += 1
    uids = list(table)
    users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(uids)).all()}
        if uids
        else {}
    )
    rows = [
        {
            "user_id": uid,
            "display_name": (users[uid].display_name or users[uid].username)
            if uid in users
            else None,
            "is_me": uid == current_user.id,
            "correct": table[uid]["correct"],
            "total": table[uid]["total"],
        }
        for uid in uids
    ]
    rows.sort(key=lambda r: (-r["correct"], -r["total"], r["display_name"] or ""))
    return success_response({"standings": rows, "resolved_count": len(resolved)})
