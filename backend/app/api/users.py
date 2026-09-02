from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import success_response
from app.schemas.user import UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/search")
def search_users(
    q: str = Query(..., min_length=1),
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q_lower = f"%{q.lower()}%"
    users = (
        db.query(User)
        .filter(or_(User.username.ilike(q_lower), User.display_name.ilike(q_lower)))
        .filter(User.id != current_user.id)
        .limit(limit)
        .all()
    )
    result = []
    for u in users:
        result.append(
            {
                "id": u.id,
                "username": u.username,
                "display_name": u.display_name,
                "avatar_url": u.avatar_url,
                "about": u.about,
                "is_online": u.is_online,
                "last_seen": u.last_seen.isoformat() if u.last_seen else None,
            }
        )
    return success_response(result)


@router.get("/{username}")
def get_user_by_username(
    username: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.username == username.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return success_response(
        {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "about": user.about,
            "is_online": user.is_online,
            "last_seen": user.last_seen.isoformat() if user.last_seen else None,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
    )


@router.patch("/me")
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.display_name is not None:
        current_user.display_name = payload.display_name
    if payload.about is not None:
        current_user.about = payload.about
    if payload.avatar_url is not None:
        current_user.avatar_url = payload.avatar_url
    db.commit()
    db.refresh(current_user)
    return success_response(
        {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "display_name": current_user.display_name,
            "avatar_url": current_user.avatar_url,
            "about": current_user.about,
            "is_online": current_user.is_online,
            "last_seen": current_user.last_seen.isoformat()
            if current_user.last_seen
            else None,
            "created_at": current_user.created_at.isoformat()
            if current_user.created_at
            else None,
        },
        "Profile updated",
    )


@router.get("/me/profile")
def get_my_profile(current_user: User = Depends(get_current_user)):
    return success_response(
        {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "display_name": current_user.display_name,
            "avatar_url": current_user.avatar_url,
            "about": current_user.about,
            "is_online": current_user.is_online,
            "last_seen": current_user.last_seen.isoformat()
            if current_user.last_seen
            else None,
            "created_at": current_user.created_at.isoformat()
            if current_user.created_at
            else None,
        }
    )


@router.get("/leaderboard")
def get_leaderboard(
    limit: int = 50,
    scope: str = Query("global", description="global or friends"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.message import Message
    from app.models.conversation import ConversationMember
    from sqlalchemy import func
    from datetime import datetime, timedelta, timezone

    # Get start of current week (Monday 00:00 UTC)
    now = datetime.now(timezone.utc)
    days_since_monday = now.weekday()
    week_start = (now - timedelta(days=days_since_monday)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_end = week_start + timedelta(days=7)

    # Base query: messages from this week
    base_q = db.query(Message).filter(
        Message.is_deleted == False,
        Message.sender_id.isnot(None),
        Message.created_at >= week_start,
        Message.created_at < week_end,
    )

    # If friends scope, filter to only users in same conversations
    friend_ids = None
    if scope == "friends":
        my_conv_ids = [
            m.conversation_id
            for m in db.query(ConversationMember)
            .filter_by(user_id=current_user.id)
            .all()
        ]
        friend_ids = list(
            set(
                m.user_id
                for m in db.query(ConversationMember)
                .filter(
                    ConversationMember.conversation_id.in_(my_conv_ids),
                    ConversationMember.user_id != current_user.id,
                )
                .all()
            )
        )
        # Add current user
        friend_ids.append(current_user.id)
        base_q = base_q.filter(Message.sender_id.in_(friend_ids))

    # Count messages per user
    message_counts = (
        base_q.with_entities(
            Message.sender_id, func.count(Message.id).label("message_count")
        )
        .group_by(Message.sender_id)
        .order_by(func.count(Message.id).desc())
        .limit(limit)
        .all()
    )

    result = []
    rank = 1
    for sender_id, count in message_counts:
        u = db.query(User).filter_by(id=sender_id).first()
        if not u:
            continue
        result.append(
            {
                "rank": rank,
                "user_id": u.id,
                "username": u.username,
                "display_name": u.display_name,
                "avatar_url": u.avatar_url,
                "is_online": u.is_online,
                "message_count": count,
                "is_current_user": u.id == current_user.id,
            }
        )
        rank += 1

    return success_response(
        {
            "users": result,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
        }
    )
