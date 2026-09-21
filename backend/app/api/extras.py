"""Combined per-conversation extras: polls + events + pinned messages.

Opening a chat used to cost 4 round trips (messages, polls, events, pins).
This serves the last three in one response so a tap resolves in a single
round trip after history. Poll/event/pin panels keep their own endpoints.
"""

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.models.conversation import ConversationMember
from app.models.event import EventResponse, GroupEvent
from app.models.message import Message
from app.models.user import User
from app.schemas.common import success_response
from app.api.polls import _batched_polls, _is_member as _poll_member

router = APIRouter(prefix="/api", tags=["extras"])


def _batched_events(db: Session, conv_id: int):
    events = (
        db.query(GroupEvent)
        .filter_by(conversation_id=conv_id)
        .order_by(desc(GroupEvent.event_date))
        .limit(50)
        .all()
    )
    if not events:
        return []
    eids = [e.id for e in events]
    resp_by_event: dict = defaultdict(list)
    for r in db.query(EventResponse).filter(EventResponse.event_id.in_(eids)).all():
        resp_by_event[r.event_id].append(r)
    creator_ids = {e.creator_id for e in events if e.creator_id}
    creators = (
        {u.id: u for u in db.query(User).filter(User.id.in_(creator_ids)).all()}
        if creator_ids
        else {}
    )
    out = []
    for e in events:
        responses = resp_by_event.get(e.id, [])
        going = [r.user_id for r in responses if r.response == "going"]
        maybe = [r.user_id for r in responses if r.response == "maybe"]
        cant_go = [r.user_id for r in responses if r.response == "cant_go"]
        creator = creators.get(e.creator_id) if e.creator_id else None
        out.append(
            {
                "id": e.id,
                "conversation_id": e.conversation_id,
                "creator_id": e.creator_id,
                "creator_name": creator.display_name if creator else "Unknown",
                "title": e.title,
                "description": e.description,
                "event_date": e.event_date.isoformat() if e.event_date else None,
                "location": e.location,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "going_count": len(going),
                "maybe_count": len(maybe),
                "cant_go_count": len(cant_go),
                "going": going,
                "maybe": maybe,
                "cant_go": cant_go,
                "total_responses": len(responses),
            }
        )
    return out


@router.get("/conversations/{conv_id}/extras")
def conversation_extras(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _poll_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    from app.api.messages import _get_messages_query, _message_to_dict
    from app.utils.receipts import receipt_map

    pinned = (
        _get_messages_query(db, conv_id)
        .filter(Message.is_pinned == True)  # noqa: E712
        .order_by(desc(Message.pinned_at))
        .limit(50)
        .all()
    )
    receipts = receipt_map(db, conv_id)
    return success_response(
        {
            "polls": _batched_polls(db, conv_id),
            "events": _batched_events(db, conv_id),
            "pinned": [_message_to_dict(m, receipts, current_user.id) for m in pinned],
        }
    )
