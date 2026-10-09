from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User, BlockedUser
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.broadcast import BroadcastList
from app.schemas.common import success_response
from app.services.errors import service_route
from app.services import broadcasts as broadcast_service

router = APIRouter(prefix="/api/broadcasts", tags=["broadcasts"])


def _list_to_dict(bl: BroadcastList):
    members = bl.member_ids or []
    return {
        "id": bl.id,
        "name": bl.name,
        "member_ids": members,
        "member_count": len(members),
        "created_at": bl.created_at.isoformat() if bl.created_at else None,
    }


def _blocked_either(db: Session, a: int, b: int) -> bool:
    return (
        db.query(BlockedUser)
        .filter(
            ((BlockedUser.blocker_id == a) & (BlockedUser.blocked_id == b))
            | ((BlockedUser.blocker_id == b) & (BlockedUser.blocked_id == a))
        )
        .first()
        is not None
    )


def _get_or_create_dm(db: Session, me_id: int, other_id: int):
    """Mirror of the 1-1 creation flow: reuse the exact-pair chat or make it."""
    existing = (
        db.query(Conversation)
        .join(
            ConversationMember,
            Conversation.id == ConversationMember.conversation_id,
        )
        .filter(Conversation.is_group == False)  # noqa: E712
        .filter(ConversationMember.user_id.in_([me_id, other_id]))
        .all()
    )
    for conv in existing:
        members = db.query(ConversationMember).filter_by(conversation_id=conv.id).all()
        mids = set(m.user_id for m in members)
        if mids == {me_id, other_id} and len(mids) == 2:
            return conv
    conv = Conversation(is_group=False, created_by=me_id)
    db.add(conv)
    db.flush()
    db.add(ConversationMember(conversation_id=conv.id, user_id=me_id, role="member"))
    db.add(ConversationMember(conversation_id=conv.id, user_id=other_id, role="member"))
    return conv


@router.get("")
def list_broadcasts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lists = (
        db.query(BroadcastList)
        .filter_by(owner_id=current_user.id)
        .order_by(BroadcastList.id.desc())
        .all()
    )
    return success_response([_list_to_dict(bl) for bl in lists])


@router.post("")
def create_broadcast(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="List name required")
    member_ids = set(payload.get("member_ids") or [])
    for uname in payload.get("member_usernames") or []:
        u = db.query(User).filter_by(username=str(uname).lower()).first()
        if u:
            member_ids.add(u.id)
    member_ids.discard(current_user.id)
    valid = []
    for uid in member_ids:
        if not db.query(User).filter_by(id=uid).first():
            continue
        valid.append(uid)
    if not valid:
        raise HTTPException(status_code=400, detail="Add at least one member")
    bl = BroadcastList(owner_id=current_user.id, name=name[:100], member_ids=valid)
    db.add(bl)
    db.commit()
    db.refresh(bl)
    return success_response(_list_to_dict(bl), "Broadcast list created")


@router.delete("/{list_id}")
def delete_broadcast(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bl = db.query(BroadcastList).filter_by(id=list_id, owner_id=current_user.id).first()
    if not bl:
        raise HTTPException(status_code=404, detail="Broadcast list not found")
    db.delete(bl)
    db.commit()
    return success_response(None, "Broadcast list deleted")


@router.get("/{list_id}/members")
@service_route
def list_broadcast_members(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bl, members = broadcast_service.list_members(
        db, list_id=list_id, owner_id=current_user.id
    )
    return success_response({"list": _list_to_dict(bl), "members": members})


@router.post("/{list_id}/members")
@service_route
def add_broadcast_member(
    list_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bl, added = broadcast_service.add_member(
        db,
        list_id=list_id,
        owner_id=current_user.id,
        user_id=payload.get("user_id"),
        username=payload.get("username"),
    )
    return success_response(
        _list_to_dict(bl), "Added to list" if added else "Already a member"
    )


@router.delete("/{list_id}/members/{user_id}")
@service_route
def remove_broadcast_member(
    list_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bl, removed = broadcast_service.remove_member(
        db, list_id=list_id, owner_id=current_user.id, user_id=user_id
    )
    return success_response(
        _list_to_dict(bl), "Removed from list" if removed else "Not a member"
    )


@router.post("/{list_id}/send")
def send_broadcast(
    list_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bl = db.query(BroadcastList).filter_by(id=list_id, owner_id=current_user.id).first()
    if not bl:
        raise HTTPException(status_code=404, detail="Broadcast list not found")
    content = (payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message text required")
    if len(content) > 4000:
        raise HTTPException(status_code=400, detail="Message too long")

    from app.api.messages import _broadcast_soon, _member_ids

    sent_to = []
    sent = []
    for uid in bl.member_ids or []:
        if uid == current_user.id:
            continue
        if not db.query(User).filter_by(id=uid).first():
            continue
        if _blocked_either(db, current_user.id, uid):
            continue
        conv = _get_or_create_dm(db, current_user.id, uid)
        msg = Message(
            conversation_id=conv.id,
            sender_id=current_user.id,
            content=content,
            message_type="text",
        )
        db.add(msg)
        db.flush()
        _broadcast_soon(
            conv.id,
            {
                "type": "message.new",
                "payload": {
                    "id": msg.id,
                    "conversation_id": conv.id,
                    "sender_id": current_user.id,
                    "sender_username": current_user.username,
                    "sender_display_name": current_user.display_name,
                    "sender_avatar": current_user.avatar_url,
                    "content": content,
                    "message_type": "text",
                    "is_deleted": False,
                    "is_edited": False,
                    "created_at": msg.created_at.isoformat()
                    if msg.created_at
                    else None,
                    "attachments": [],
                    "reactions": [],
                    "status": "sent",
                },
            },
            member_ids=_member_ids(db, conv.id),
        )
        sent_to.append(uid)
        # PE-2I: expose the persisted per-recipient message identity so the
        # owner can query real delivery/read state via the existing
        # sender-only receipts endpoint. `sent_to` shape is unchanged.
        sent.append({"user_id": uid, "conversation_id": conv.id, "message_id": msg.id})
    db.commit()
    return success_response(
        {"sent_to": sent_to, "sent": sent}, f"Sent to {len(sent_to)} chats"
    )
