from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.channel import Channel, ChannelFollow, ChannelPost
from app.schemas.common import success_response
from app.services.errors import service_route
from app.services import channels as channel_service
from app.services.errors import MISSING

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
        "avatar_url": getattr(c, "avatar_url", None),
        "icon": getattr(c, "icon", None),
        "cover_theme": getattr(c, "cover_theme", None),
        "cover_url": getattr(c, "cover_url", None),
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
    # Thin compatibility wrapper; new code calls channel_service.get_channel.
    return channel_service.get_channel(db, channel_id)


def _require_reader(db: Session, c: Channel, user_id: int):
    """Owner or follower may read the feed; anyone may discover channels."""
    return channel_service.require_reader(db, c, user_id)


@router.get("")
@service_route
def list_channels(
    limit: int = Query(200, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channels = channel_service.list_channels(db, limit=limit)
    return success_response(
        [_channel_to_dict(db, c, current_user.id) for c in channels]
    )


@router.post("")
@service_route
def create_channel(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = channel_service.create_channel(
        db,
        owner_id=current_user.id,
        name=payload.get("name"),
        description=payload.get("description"),
        avatar_url=payload.get("avatar_url"),
        icon=payload.get("icon"),
        cover_theme=payload.get("cover_theme"),
        cover_url=payload.get("cover_url"),
    )
    return success_response(_channel_to_dict(db, c, current_user.id), "Channel created")


@router.patch("/{channel_id}")
@service_route
def update_channel(
    channel_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = channel_service.update_channel(
        db,
        channel_id=channel_id,
        actor_id=current_user.id,
        name=payload.get("name") if payload.get("name") is not None else MISSING,
        description=payload.get("description") if "description" in payload else MISSING,
        avatar_url=payload.get("avatar_url") if "avatar_url" in payload else MISSING,
        icon=payload.get("icon") if "icon" in payload else MISSING,
        cover_theme=payload.get("cover_theme") if "cover_theme" in payload else MISSING,
        cover_url=payload.get("cover_url") if "cover_url" in payload else MISSING,
    )
    return success_response(_channel_to_dict(db, c, current_user.id), "Channel updated")


@router.delete("/{channel_id}")
@service_route
def delete_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channel_service.delete_channel(db, channel_id=channel_id, actor_id=current_user.id)
    return success_response(None, "Channel deleted")


@router.post("/{channel_id}/follow")
@service_route
def follow_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = channel_service.follow_channel(
        db, channel_id=channel_id, user_id=current_user.id
    )
    return success_response(
        _channel_to_dict(db, c, current_user.id), "Channel followed"
    )


@router.delete("/{channel_id}/follow")
@service_route
def unfollow_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = channel_service.unfollow_channel(
        db, channel_id=channel_id, user_id=current_user.id
    )
    return success_response(
        _channel_to_dict(db, c, current_user.id), "Channel unfollowed"
    )


@router.get("/{channel_id}/posts")
@service_route
def list_posts(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    posts = channel_service.list_posts(
        db, channel_id=channel_id, user_id=current_user.id
    )
    return success_response([_post_to_dict(db, p) for p in reversed(posts)])


@router.post("/{channel_id}/posts")
@service_route
def create_post(
    channel_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Only the owner posts — channels are one-way, like announcements."""
    p = channel_service.create_post(
        db,
        channel_id=channel_id,
        sender_id=current_user.id,
        content=payload.get("content"),
    )
    return success_response(_post_to_dict(db, p), "Posted to channel")


@router.delete("/{channel_id}/posts/{post_id}")
@service_route
def delete_post(
    channel_id: int,
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner-only: delete a channel post."""
    channel_service.delete_post(
        db,
        channel_id=channel_id,
        post_id=post_id,
        actor_id=current_user.id,
    )
    return success_response(None, "Post deleted")
