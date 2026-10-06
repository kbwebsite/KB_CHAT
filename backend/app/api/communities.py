from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.community import Community, CommunityGroup
from app.schemas.common import success_response

router = APIRouter(prefix="/api/communities", tags=["communities"])


def _my_group_ids(db: Session, user_id: int) -> set:
    rows = db.query(ConversationMember.conversation_id).filter_by(user_id=user_id).all()
    return {r[0] for r in rows}


def _community_to_dict(db: Session, c: Community):
    links = db.query(CommunityGroup).filter_by(community_id=c.id).all()
    groups = []
    for link in links:
        conv = db.query(Conversation).filter_by(id=link.conversation_id).first()
        if not conv:
            continue
        member_count = (
            db.query(ConversationMember).filter_by(conversation_id=conv.id).count()
        )
        groups.append(
            {
                "id": conv.id,
                "title": conv.title,
                "avatar_url": conv.avatar_url,
                "member_count": member_count,
            }
        )
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description,
        "owner_id": c.owner_id,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "groups": groups,
    }


def _get_visible(db: Session, community_id: int, user_id: int):
    """Community if the user owns it or sits in one of its groups."""
    c = db.query(Community).filter_by(id=community_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    if c.owner_id != user_id:
        linked = {
            g.conversation_id
            for g in db.query(CommunityGroup).filter_by(community_id=c.id).all()
        }
        mine = _my_group_ids(db, user_id)
        if not (linked & mine):
            raise HTTPException(status_code=403, detail="Not a community member")
    return c


@router.get("")
def list_communities(
    limit: int = Query(200, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mine = _my_group_ids(db, current_user.id)
    out = []
    for c in db.query(Community).order_by(Community.id.desc()).limit(limit).all():
        if c.owner_id == current_user.id:
            out.append(_community_to_dict(db, c))
            continue
        linked = {
            g.conversation_id
            for g in db.query(CommunityGroup).filter_by(community_id=c.id).all()
        }
        if linked & mine:
            out.append(_community_to_dict(db, c))
    return success_response(out)


@router.post("")
def create_community(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Community name required")
    c = Community(
        owner_id=current_user.id,
        name=name[:100],
        description=(payload.get("description") or "").strip() or None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return success_response(_community_to_dict(db, c), "Community created")


@router.patch("/{community_id}")
def update_community(
    community_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(Community).filter_by(id=community_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    if c.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can edit")
    if payload.get("name") is not None:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Community name required")
        c.name = name[:100]
    if "description" in payload:
        desc = payload.get("description")
        c.description = str(desc).strip() or None if desc else None
    db.commit()
    db.refresh(c)
    return success_response(_community_to_dict(db, c), "Community updated")


@router.delete("/{community_id}")
def delete_community(
    community_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(Community).filter_by(id=community_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    if c.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete")
    db.query(CommunityGroup).filter_by(community_id=c.id).delete()
    db.delete(c)
    db.commit()
    return success_response(None, "Community deleted")


@router.post("/{community_id}/groups")
def add_community_group(
    community_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(Community).filter_by(id=community_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    if c.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can add groups")
    conv_id = payload.get("conversation_id")
    try:
        conv_id = int(conv_id) if conv_id is not None else None
    except (TypeError, ValueError):
        conv_id = None
    conv = (
        db.query(Conversation).filter_by(id=conv_id, is_group=True).first()
        if conv_id
        else None
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    mine = (
        db.query(ConversationMember)
        .filter_by(conversation_id=conv.id, user_id=current_user.id)
        .first()
    )
    if not mine:
        raise HTTPException(
            status_code=403, detail="You must be in the group to link it"
        )
    exists = (
        db.query(CommunityGroup)
        .filter_by(community_id=c.id, conversation_id=conv.id)
        .first()
    )
    if not exists:
        db.add(CommunityGroup(community_id=c.id, conversation_id=conv.id))
        db.commit()
    db.refresh(c)
    return success_response(_community_to_dict(db, c), "Group added")


@router.delete("/{community_id}/groups/{conv_id}")
def remove_community_group(
    community_id: int,
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(Community).filter_by(id=community_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    if c.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can remove groups")
    db.query(CommunityGroup).filter_by(
        community_id=c.id, conversation_id=conv_id
    ).delete()
    db.commit()
    db.refresh(c)
    return success_response(_community_to_dict(db, c), "Group removed")


@router.post("/{community_id}/announce")
def announce_to_community(
    community_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner announcement fanned out as a normal message into every group."""
    c = db.query(Community).filter_by(id=community_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    if c.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can announce")
    content = (payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Announcement text required")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Announcement too long")

    from app.api.messages import _broadcast_soon, _member_ids

    reached = []
    links = db.query(CommunityGroup).filter_by(community_id=c.id).all()
    for link in links:
        conv = db.query(Conversation).filter_by(id=link.conversation_id).first()
        if not conv:
            continue
        msg = Message(
            conversation_id=conv.id,
            sender_id=current_user.id,
            content=f"📢 {content}",
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
                    "content": f"📢 {content}",
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
        reached.append(conv.id)
    db.commit()
    return success_response({"reached": reached}, f"Announced to {len(reached)} groups")
