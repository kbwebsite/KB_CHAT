from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.channel import Channel, ChannelFollow, ChannelPost
from app.schemas.common import success_response

router = APIRouter(prefix="/api/channels", tags=["channels"])


def _channel_to_dict(db: Session, c: Channel, user_id: int):
    follower_count = db.query(ChannelFollow).filter_by(channel_id=c.id).count()
    post_count = db.query(ChannelPost).filter_by(channel_id=c.id).count()
    followed = (
        db.query(ChannelFollow).filter_by(channel_id=c.id, user_id=user_id).first()
        is not None
    )
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description,
        "owner_id": c.owner_id,
        "is_owner": c.owner_id == user_id,
        "followed": followed,
        "follower_count": follower_count,
        "post_count": post_count,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _post_to_dict(db: Session, p: ChannelPost):
    sender = db.query(User).filter_by(id=p.sender_id).first()
    return {
        "id": p.id,
        "channel_id": p.channel_id,
        "sender_id": p.sender_id,
        "sender_username": sender.username if sender else None,
        "sender_display_name": sender.display_name if sender else None,
        "sender_avatar": sender.avatar_url if sender else None,
        "content": p.content,
        "message_type": p.message_type,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _get_channel(db: Session, channel_id: int) -> Channel:
    c = db.query(Channel).filter_by(id=channel_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Channel not found")
    return c


def _require_reader(db: Session, c: Channel, user_id: int):
    """Owner or follower may read the feed; anyone may discover channels."""
    if c.owner_id == user_id:
        return
    followed = (
        db.query(ChannelFollow).filter_by(channel_id=c.id, user_id=user_id).first()
    )
    if not followed:
        raise HTTPException(status_code=403, detail="Follow this channel first")


@router.get("")
def list_channels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channels = db.query(Channel).order_by(Channel.id.desc()).all()
    return success_response(
        [_channel_to_dict(db, c, current_user.id) for c in channels]
    )


@router.post("")
def create_channel(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Channel name required")
    c = Channel(
        owner_id=current_user.id,
        name=name[:100],
        description=(payload.get("description") or "").strip() or None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return success_response(_channel_to_dict(db, c, current_user.id), "Channel created")


@router.patch("/{channel_id}")
def update_channel(
    channel_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _get_channel(db, channel_id)
    if c.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can edit")
    if payload.get("name") is not None:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Channel name required")
        c.name = name[:100]
    if "description" in payload:
        desc = payload.get("description")
        c.description = str(desc).strip() or None if desc else None
    db.commit()
    db.refresh(c)
    return success_response(_channel_to_dict(db, c, current_user.id), "Channel updated")


@router.delete("/{channel_id}")
def delete_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _get_channel(db, channel_id)
    if c.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete")
    db.query(ChannelPost).filter_by(channel_id=c.id).delete()
    db.query(ChannelFollow).filter_by(channel_id=c.id).delete()
    db.delete(c)
    db.commit()
    return success_response(None, "Channel deleted")


@router.post("/{channel_id}/follow")
def follow_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _get_channel(db, channel_id)
    exists = (
        db.query(ChannelFollow)
        .filter_by(channel_id=c.id, user_id=current_user.id)
        .first()
    )
    if not exists:
        db.add(ChannelFollow(channel_id=c.id, user_id=current_user.id))
        db.commit()
    db.refresh(c)
    return success_response(
        _channel_to_dict(db, c, current_user.id), "Channel followed"
    )


@router.delete("/{channel_id}/follow")
def unfollow_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _get_channel(db, channel_id)
    db.query(ChannelFollow).filter_by(channel_id=c.id, user_id=current_user.id).delete()
    db.commit()
    db.refresh(c)
    return success_response(
        _channel_to_dict(db, c, current_user.id), "Channel unfollowed"
    )


@router.get("/{channel_id}/posts")
def list_posts(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = _get_channel(db, channel_id)
    _require_reader(db, c, current_user.id)
    posts = (
        db.query(ChannelPost)
        .filter_by(channel_id=c.id)
        .order_by(ChannelPost.id.desc())
        .limit(100)
        .all()
    )
    return success_response([_post_to_dict(db, p) for p in reversed(posts)])


@router.post("/{channel_id}/posts")
def create_post(
    channel_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Only the owner posts — channels are one-way, like announcements."""
    c = _get_channel(db, channel_id)
    if c.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can post")
    content = (payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Post text required")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Post too long")
    p = ChannelPost(
        channel_id=c.id,
        sender_id=current_user.id,
        content=content,
        message_type="text",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return success_response(_post_to_dict(db, p), "Posted to channel")
