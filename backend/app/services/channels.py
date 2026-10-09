"""Channel business rules (Wave 1).

Self-contained domain: owner/follower gates, name/description validation,
idempotent follow. Routes validate request *shape* and format responses with
the ``_channel_to_dict`` / ``_post_to_dict`` presenters (which stay in
``api/channels.py``); this module owns the *decisions* and mutations.
Status codes and messages are byte-identical to the pre-Wave-1 handlers.
"""

from sqlalchemy.orm import Session

from app.models.channel import Channel, ChannelFollow, ChannelPost
from app.services.errors import MISSING, bad_request, forbidden, not_found


def get_channel(db: Session, channel_id: int) -> Channel:
    c = db.query(Channel).filter_by(id=channel_id).first()
    if not c:
        raise not_found("Channel not found")
    return c


def require_reader(db: Session, c: Channel, user_id: int) -> None:
    """Owner or follower may read the feed; anyone may discover channels."""
    if c.owner_id == user_id:
        return
    followed = (
        db.query(ChannelFollow).filter_by(channel_id=c.id, user_id=user_id).first()
    )
    if not followed:
        raise forbidden("Follow this channel first")


def _require_owner(c: Channel, actor_id: int, action: str) -> None:
    if c.owner_id != actor_id:
        raise forbidden(f"Only the owner can {action}")


def list_channels(db: Session, limit: int = 200) -> list:
    return db.query(Channel).order_by(Channel.id.desc()).limit(limit).all()


def create_channel(
    db: Session,
    *,
    owner_id: int,
    name: str,
    description=None,
    avatar_url=None,
    icon=None,
    cover_theme=None,
    cover_url=None,
) -> Channel:
    clean = (name or "").strip()
    if not clean:
        raise bad_request("Channel name required")
    c = Channel(
        owner_id=owner_id,
        name=clean[:100],
        description=(description or "").strip() or None,
        avatar_url=(str(avatar_url).strip()[:500] or None) if avatar_url else None,
        icon=(str(icon).strip()[:16] or None) if icon else None,
        cover_theme=(str(cover_theme).strip()[:50] or None) if cover_theme else None,
        cover_url=(str(cover_url).strip()[:500] or None) if cover_url else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def update_channel(
    db: Session,
    *,
    channel_id: int,
    actor_id: int,
    name=MISSING,
    description=MISSING,
    avatar_url=MISSING,
    icon=MISSING,
    cover_theme=MISSING,
    cover_url=MISSING,
) -> Channel:
    c = get_channel(db, channel_id)
    _require_owner(c, actor_id, "edit")
    if name is not MISSING:
        clean = str(name or "").strip()
        if not clean:
            raise bad_request("Channel name required")
        c.name = clean[:100]
    if description is not MISSING:
        desc = description
        c.description = str(desc).strip() or None if desc else None
    if avatar_url is not MISSING:
        c.avatar_url = str(avatar_url).strip()[:500] or None if avatar_url else None
    if icon is not MISSING:
        c.icon = str(icon).strip()[:16] or None if icon else None
    if cover_theme is not MISSING:
        c.cover_theme = str(cover_theme).strip()[:50] or None if cover_theme else None
    if cover_url is not MISSING:
        c.cover_url = str(cover_url).strip()[:500] or None if cover_url else None
    db.commit()
    db.refresh(c)
    return c


def delete_channel(db: Session, *, channel_id: int, actor_id: int) -> None:
    c = get_channel(db, channel_id)
    _require_owner(c, actor_id, "delete")
    db.query(ChannelPost).filter_by(channel_id=c.id).delete()
    db.query(ChannelFollow).filter_by(channel_id=c.id).delete()
    db.delete(c)
    db.commit()


def follow_channel(db: Session, *, channel_id: int, user_id: int) -> Channel:
    c = get_channel(db, channel_id)
    exists = db.query(ChannelFollow).filter_by(channel_id=c.id, user_id=user_id).first()
    if not exists:
        db.add(ChannelFollow(channel_id=c.id, user_id=user_id))
        db.commit()
    db.refresh(c)
    return c


def unfollow_channel(db: Session, *, channel_id: int, user_id: int) -> Channel:
    c = get_channel(db, channel_id)
    db.query(ChannelFollow).filter_by(channel_id=c.id, user_id=user_id).delete()
    db.commit()
    db.refresh(c)
    return c


def list_posts(db: Session, *, channel_id: int, user_id: int) -> list:
    c = get_channel(db, channel_id)
    require_reader(db, c, user_id)
    return (
        db.query(ChannelPost)
        .filter_by(channel_id=c.id)
        .order_by(ChannelPost.id.desc())
        .limit(100)
        .all()
    )


def create_post(db: Session, *, channel_id: int, sender_id: int, content: str):
    """Only the owner posts — channels are one-way, like announcements."""
    c = get_channel(db, channel_id)
    _require_owner(c, sender_id, "post")
    clean = (content or "").strip()
    if not clean:
        raise bad_request("Post text required")
    if len(clean) > 2000:
        raise bad_request("Post too long")
    p = ChannelPost(
        channel_id=c.id,
        sender_id=sender_id,
        content=clean,
        message_type="text",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def delete_post(db: Session, *, channel_id: int, post_id: int, actor_id: int) -> None:
    """Owner-only post delete."""
    c = get_channel(db, channel_id)
    _require_owner(c, actor_id, "delete posts in")
    p = db.query(ChannelPost).filter_by(id=post_id, channel_id=c.id).first()
    if not p:
        raise not_found("Post not found")
    db.delete(p)
    db.commit()
