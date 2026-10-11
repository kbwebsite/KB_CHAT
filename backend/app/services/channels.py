"""Channel business rules (Wave 1).

Self-contained domain: owner/follower gates, name/description validation,
idempotent follow. Routes validate request *shape* and format responses with
the ``_channel_to_dict`` / ``_post_to_dict`` presenters (which stay in
``api/channels.py``); this module owns the *decisions* and mutations.
Status codes and messages are byte-identical to the pre-Wave-1 handlers.
"""

from sqlalchemy.orm import Session

from app.models.channel import (
    Channel,
    ChannelFollow,
    ChannelPost,
    ChannelPostReaction,
    ChannelPoll,
    ChannelPollOption,
    ChannelPollVote,
)
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
    category=None,
    avatar_theme=None,
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
        category=(str(category).strip().lower()[:30] or None) if category else None,
        avatar_theme=(str(avatar_theme).strip()[:50] or None) if avatar_theme else None,
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
    category=MISSING,
    avatar_theme=MISSING,
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
    if category is not MISSING:
        c.category = str(category).strip().lower()[:30] or None if category else None
    if avatar_theme is not MISSING:
        c.avatar_theme = (
            str(avatar_theme).strip()[:50] or None if avatar_theme else None
        )
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
    # Explicit cleanup alongside FK cascade (SQLite ignores ON DELETE CASCADE).
    db.query(ChannelPostReaction).filter_by(post_id=p.id).delete()
    db.delete(p)
    db.commit()


def post_reaction_summary(db: Session, *, post_id: int, user_id: int) -> list:
    """Aggregated reactions for one post: [{emoji, count, mine}]."""
    rows = db.query(ChannelPostReaction).filter_by(post_id=post_id).all()
    by_emoji: dict = {}
    for r in rows:
        e = by_emoji.setdefault(r.emoji, {"emoji": r.emoji, "count": 0, "mine": False})
        e["count"] += 1
        if r.user_id == user_id:
            e["mine"] = True
    return sorted(by_emoji.values(), key=lambda x: -x["count"])


def toggle_post_reaction(
    db: Session, *, channel_id: int, post_id: int, user_id: int, emoji: str
) -> dict:
    """Followers (and owner) toggle one emoji reaction per tap."""
    c = get_channel(db, channel_id)
    require_reader(db, c, user_id)
    p = db.query(ChannelPost).filter_by(id=post_id, channel_id=c.id).first()
    if not p:
        raise not_found("Post not found")
    clean = str(emoji or "").strip()[:16]
    if not clean:
        raise bad_request("Emoji required")
    existing = (
        db.query(ChannelPostReaction)
        .filter_by(post_id=p.id, user_id=user_id, emoji=clean)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        reacted = False
    else:
        db.add(ChannelPostReaction(post_id=p.id, user_id=user_id, emoji=clean))
        db.commit()
        reacted = True
    return {
        "post_id": p.id,
        "reacted": reacted,
        "reactions": post_reaction_summary(db, post_id=p.id, user_id=user_id),
    }


def _get_channel_poll(db: Session, channel_id: int, poll_id: int) -> ChannelPoll:
    poll = db.query(ChannelPoll).filter_by(id=poll_id, channel_id=channel_id).first()
    if not poll:
        raise not_found("Poll not found")
    return poll


def create_channel_poll(
    db: Session, *, channel_id: int, owner_id: int, question: str, options: list
) -> ChannelPoll:
    """Only the channel owner creates polls."""
    c = get_channel(db, channel_id)
    _require_owner(c, owner_id, "create polls in")
    clean_q = str(question or "").strip()
    if not clean_q:
        raise bad_request("Question required")
    clean_opts = [str(o or "").strip()[:200] for o in (options or [])]
    clean_opts = [o for o in clean_opts if o][:8]
    if len(clean_opts) < 2:
        raise bad_request("At least 2 options required")
    poll = ChannelPoll(channel_id=c.id, creator_id=owner_id, question=clean_q[:500])
    db.add(poll)
    db.flush()
    for i, text_val in enumerate(clean_opts):
        db.add(ChannelPollOption(poll_id=poll.id, text=text_val, position=i))
    db.commit()
    db.refresh(poll)
    return poll


def list_channel_polls(db: Session, *, channel_id: int, user_id: int) -> list:
    c = get_channel(db, channel_id)
    require_reader(db, c, user_id)
    return (
        db.query(ChannelPoll)
        .filter_by(channel_id=c.id)
        .order_by(ChannelPoll.id.desc())
        .limit(50)
        .all()
    )


def vote_channel_poll(
    db: Session, *, channel_id: int, poll_id: int, user_id: int, option_ids: list
) -> ChannelPoll:
    """Single-choice: voting replaces the voter's previous choice."""
    c = get_channel(db, channel_id)
    require_reader(db, c, user_id)
    poll = _get_channel_poll(db, c.id, poll_id)
    if poll.closes_at is not None:
        raise bad_request("Poll is closed")
    opts = (
        db.query(ChannelPollOption)
        .filter_by(poll_id=poll.id)
        .order_by(ChannelPollOption.position)
        .all()
    )
    want = [o for o in opts if o.id in set(option_ids or [])]
    if not want:
        raise bad_request("Option required")
    # Single choice — clear previous votes first.
    for o in opts:
        db.query(ChannelPollVote).filter_by(
            poll_option_id=o.id, user_id=user_id
        ).delete()
    chosen = want[0]
    db.add(ChannelPollVote(poll_option_id=chosen.id, user_id=user_id))
    db.commit()
    db.refresh(poll)
    return poll


def close_channel_poll(
    db: Session, *, channel_id: int, poll_id: int, actor_id: int
) -> ChannelPoll:
    from datetime import datetime, timezone

    c = get_channel(db, channel_id)
    _require_owner(c, actor_id, "close polls in")
    poll = _get_channel_poll(db, c.id, poll_id)
    poll.closes_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(poll)
    return poll


def delete_channel_poll(
    db: Session, *, channel_id: int, poll_id: int, actor_id: int
) -> None:
    c = get_channel(db, channel_id)
    _require_owner(c, actor_id, "delete polls in")
    poll = _get_channel_poll(db, c.id, poll_id)
    opt_ids = [
        o.id for o in db.query(ChannelPollOption).filter_by(poll_id=poll.id).all()
    ]
    if opt_ids:
        db.query(ChannelPollVote).filter(
            ChannelPollVote.poll_option_id.in_(opt_ids)
        ).delete(synchronize_session=False)
        db.query(ChannelPollOption).filter_by(poll_id=poll.id).delete()
    db.delete(poll)
    db.commit()
