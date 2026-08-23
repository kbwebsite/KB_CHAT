from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.poll import Poll, PollOption, PollVote
from app.schemas.common import success_response
from app.websocket.manager import manager

router = APIRouter(prefix="/api", tags=["polls"])

def _is_member(db: Session, conv_id: int, user_id: int) -> bool:
    return db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=user_id).first() is not None

def _member_ids(db: Session, conv_id: int):
    return [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]

def _poll_to_dict(db: Session, poll: Poll):
    options = db.query(PollOption).filter_by(poll_id=poll.id).order_by(PollOption.position).all()
    total_votes = sum(db.query(PollVote).filter_by(poll_option_id=opt.id).count() for opt in options)
    creator = db.query(User).filter_by(id=poll.creator_id).first() if poll.creator_id else None
    return {
        "id": poll.id,
        "conversation_id": poll.conversation_id,
        "creator_id": poll.creator_id,
        "creator_name": creator.display_name if creator else "Unknown",
        "question": poll.question,
        "is_multiple_choice": poll.is_multiple_choice,
        "closes_at": poll.closes_at.isoformat() if poll.closes_at else None,
        "created_at": poll.created_at.isoformat() if poll.created_at else None,
        "total_votes": total_votes,
        "options": [
            {
                "id": opt.id,
                "text": opt.text,
                "position": opt.position,
                "vote_count": db.query(PollVote).filter_by(poll_option_id=opt.id).count(),
                "voter_ids": [v.user_id for v in db.query(PollVote).filter_by(poll_option_id=opt.id).all()],
            } for opt in options
        ],
    }

@router.post("/conversations/{conv_id}/polls")
async def create_poll(conv_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    question = payload.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question required")
    options_text = payload.get("options", [])
    if len(options_text) < 2:
        raise HTTPException(status_code=400, detail="At least 2 options required")
    if len(options_text) > 10:
        raise HTTPException(status_code=400, detail="Max 10 options")
    is_multiple = payload.get("is_multiple_choice", False)
    closes_at = None
    if payload.get("closes_at"):
        try:
            closes_at = datetime.fromisoformat(payload["closes_at"].replace("Z", "+00:00"))
        except:
            pass
    poll = Poll(conversation_id=conv_id, creator_id=current_user.id, question=question, is_multiple_choice=is_multiple, closes_at=closes_at)
    db.add(poll)
    db.flush()
    for i, text_val in enumerate(options_text):
        opt = PollOption(poll_id=poll.id, text=text_val.strip(), position=i)
        db.add(opt)
    db.commit()
    db.refresh(poll)
    poll_dict = _poll_to_dict(db, poll)
    member_ids = _member_ids(db, conv_id)
    await manager.broadcast_to_conversation(conv_id, {"type": "poll.created", "payload": poll_dict}, member_ids=member_ids)
    return success_response(poll_dict, "Poll created")

@router.get("/conversations/{conv_id}/polls")
def list_polls(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    polls = db.query(Poll).filter_by(conversation_id=conv_id).order_by(desc(Poll.created_at)).limit(50).all()
    return success_response([_poll_to_dict(db, p) for p in polls])

@router.post("/polls/{poll_id}/vote")
async def vote_poll(poll_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    poll = db.query(Poll).filter_by(id=poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if not _is_member(db, poll.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    if poll.closes_at and poll.closes_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Poll is closed")
    option_ids = payload.get("option_ids", [])
    if not option_ids:
        raise HTTPException(status_code=400, detail="Option required")
    if not poll.is_multiple_choice and len(option_ids) > 1:
        raise HTTPException(status_code=400, detail="Single choice only")
    # remove previous votes if single choice
    if not poll.is_multiple_choice:
        for opt in db.query(PollOption).filter_by(poll_id=poll.id).all():
            db.query(PollVote).filter_by(poll_option_id=opt.id, user_id=current_user.id).delete()
    for oid in option_ids:
        opt = db.query(PollOption).filter_by(id=oid, poll_id=poll_id).first()
        if not opt:
            continue
        existing = db.query(PollVote).filter_by(poll_option_id=oid, user_id=current_user.id).first()
        if not existing:
            db.add(PollVote(poll_option_id=oid, user_id=current_user.id))
    db.commit()
    poll_dict = _poll_to_dict(db, poll)
    member_ids = _member_ids(db, poll.conversation_id)
    await manager.broadcast_to_conversation(poll.conversation_id, {"type": "poll.updated", "payload": poll_dict}, member_ids=member_ids)
    return success_response(poll_dict, "Vote recorded")

@router.delete("/polls/{poll_id}")
async def delete_poll(poll_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    poll = db.query(Poll).filter_by(id=poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if poll.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only creator can delete")
    conv_id = poll.conversation_id
    db.delete(poll)
    db.commit()
    member_ids = _member_ids(db, conv_id)
    await manager.broadcast_to_conversation(conv_id, {"type": "poll.deleted", "payload": {"id": poll_id, "conversation_id": conv_id}}, member_ids=member_ids)
    return success_response(None, "Poll deleted")
