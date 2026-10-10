"""Group (group-conversation) business rules (Wave 1).

Two routers expose group operations with slightly different policies:

- ``api/conversations.py`` ``/groups/{id}...`` — used by the frontend
  (``convApi``); removal requires owner/admin, no self-leave.
- ``api/groups.py`` ``/{id}...`` — removal allows self-leave with owner
  hand-off (or group deletion for a sole owner).

Both policies are preserved exactly; the ``allow_self_leave`` flag selects
between them. Routes validate request *shape* and format responses with
``conversation_to_dict``; this module owns the *decisions* and mutations.
Status codes and messages are byte-identical to the pre-Wave-1 handlers.
"""

from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.models.poll import Poll
from app.models.settings import UserSettings
from app.models.user import User
from app.services.errors import MISSING, bad_request, forbidden, not_found

# MISSING is re-exported here so routes keep using ``group_service.MISSING``.

_MANAGER_ROLES = ("owner", "admin")


def _get_group(db: Session, conv_id: int) -> Conversation:
    conv = db.query(Conversation).filter_by(id=conv_id, is_group=True).first()
    if not conv:
        raise not_found("Group not found")
    return conv


def _membership(
    db: Session, conv_id: int, user_id: int
) -> Optional[ConversationMember]:
    return (
        db.query(ConversationMember)
        .filter_by(conversation_id=conv_id, user_id=user_id)
        .first()
    )


def _apply_default_disappearing(db: Session, conv: Conversation, user_id: int) -> None:
    # Local get-or-create (mirrors api/settings.get_or_create_settings without
    # importing a route module from the service layer).
    s = db.query(UserSettings).filter_by(user_id=user_id).first()
    if not s:
        s = UserSettings(user_id=user_id)
        db.add(s)
        db.flush()
    if s.default_disappearing:
        conv.disappearing_seconds = s.default_disappearing


def _adder_allowed(db: Session, *, adder_id: int, target_id: int) -> bool:
    """Target's group-add privacy: everyone / contacts / nobody.

    "contacts" = shares at least one conversation with the adder (the
    app's contact definition everywhere else). Invite-link joins bypass
    this entirely (joining yourself is always allowed).
    """
    from app.models.settings import UserSettings

    s = db.query(UserSettings).filter_by(user_id=target_id).first()
    mode = (getattr(s, "group_add_privacy", "everyone") or "everyone").lower()
    if mode == "everyone":
        return True
    if mode == "nobody":
        return False
    mine = {
        c[0]
        for c in db.query(ConversationMember.conversation_id)
        .filter_by(user_id=target_id)
        .all()
    }
    if not mine:
        return False
    return (
        db.query(ConversationMember)
        .filter(
            ConversationMember.user_id == adder_id,
            ConversationMember.conversation_id.in_(mine),
        )
        .first()
        is not None
    )


def _display_name(db: Session, user_id: int) -> str:
    u = db.query(User).filter_by(id=user_id).first()
    return (u.display_name or u.username) if u else f"user {user_id}"


def _welcome_new_members(db: Session, conv: Conversation, user_ids: list) -> None:
    """Post a join greeting. Best-effort: never breaks the add flow."""
    try:
        ids = list(user_ids or [])[:5]
        if not ids:
            return
        names = [_display_name(db, uid) for uid in ids]
        extra = f" +{len(user_ids) - 5} more" if len(user_ids) > 5 else ""
        text = f"👋 Welcome {', '.join(names)}{extra} to {conv.title or 'the group'}! Say hi 👋"
        msg = Message(
            conversation_id=conv.id,
            sender_id=None,
            content=text,
            message_type="text",
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        from app.websocket.manager import manager

        member_ids = [
            m.user_id
            for m in db.query(ConversationMember)
            .filter_by(conversation_id=conv.id)
            .all()
        ]
        manager.spawn(
            manager.broadcast_to_conversation(
                conv.id,
                {
                    "type": "message.new",
                    "payload": {
                        "id": msg.id,
                        "conversation_id": conv.id,
                        "sender_id": None,
                        "sender_username": None,
                        "sender_display_name": None,
                        "sender_avatar": None,
                        "content": text,
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
                member_ids=member_ids,
            )
        )
    except Exception as e:
        print(f"[groups] welcome failed: {e}")


def create_group(
    db: Session,
    *,
    creator_id: int,
    title: str,
    description=None,
    member_ids=(),
    member_usernames=(),
) -> tuple:
    """Returns ``(conv, skipped_names)`` — members blocked by the target's
    group-add privacy are left out and named (no silent drops)."""
    if not title or not str(title).strip():
        raise bad_request("Group title required")
    conv = Conversation(
        is_group=True,
        title=str(title).strip(),
        description=description,
        created_by=creator_id,
    )
    db.add(conv)
    db.flush()
    db.add(
        ConversationMember(conversation_id=conv.id, user_id=creator_id, role="owner")
    )
    wanted = set(member_ids or [])
    for uname in member_usernames or []:
        u = db.query(User).filter_by(username=str(uname).lower()).first()
        if u:
            wanted.add(u.id)
    skipped = []
    for uid in wanted:
        if uid == creator_id:
            continue
        if not db.query(User).filter_by(id=uid).first():
            continue
        if not _adder_allowed(db, adder_id=creator_id, target_id=uid):
            skipped.append(_display_name(db, uid))
            continue
        db.add(ConversationMember(conversation_id=conv.id, user_id=uid, role="member"))
    _apply_default_disappearing(db, conv, creator_id)
    db.commit()
    db.refresh(conv)
    return conv, skipped


def update_group_details(
    db: Session,
    *,
    conv_id: int,
    actor_id: int,
    title=MISSING,
    description=MISSING,
    avatar_url=MISSING,
    only_admins_can_send=MISSING,
) -> Conversation:
    conv = _get_group(db, conv_id)
    mem = _membership(db, conv_id, actor_id)
    if not mem or mem.role not in _MANAGER_ROLES:
        raise forbidden("Not authorized")
    if title is not MISSING:
        conv.title = title
    if description is not MISSING:
        conv.description = description
    if avatar_url is not MISSING:
        conv.avatar_url = avatar_url
    if only_admins_can_send is not MISSING:
        conv.only_admins_can_send = bool(only_admins_can_send)
    db.commit()
    db.refresh(conv)
    return conv


def transfer_ownership(
    db: Session,
    *,
    conv_id: int,
    actor_id: int,
    target_user_id: int,
) -> Conversation:
    """Owner hands ownership to another member. Old owner becomes admin."""
    conv = _get_group(db, conv_id)
    my_mem = _membership(db, conv_id, actor_id)
    if not my_mem or my_mem.role != "owner":
        raise forbidden("Only the group owner can transfer ownership")
    target = _membership(db, conv_id, target_user_id)
    if not target:
        raise not_found("Member not found")
    if target.user_id == actor_id:
        raise bad_request("You already own this group")
    target.role = "owner"
    my_mem.role = "admin"
    conv.created_by = target.user_id
    db.commit()
    db.refresh(conv)
    return conv


def add_group_members(
    db: Session,
    *,
    conv_id: int,
    actor_id: int,
    user_ids=(),
    usernames=(),
) -> tuple:
    """Returns ``(conv, added_count, skipped_names)`` — members blocked by
    the target's group-add privacy are left out and named."""
    conv = _get_group(db, conv_id)
    mem = _membership(db, conv_id, actor_id)
    if not mem or mem.role not in _MANAGER_ROLES:
        raise forbidden("Not authorized")
    wanted = list(user_ids or [])
    for uname in usernames or []:
        u = db.query(User).filter_by(username=str(uname).lower()).first()
        if u and u.id not in wanted:
            wanted.append(u.id)
    added = 0
    skipped = []
    added_ids = []
    for uid in wanted:
        if _membership(db, conv_id, uid):
            continue
        if not db.query(User).filter_by(id=uid).first():
            continue
        if not _adder_allowed(db, adder_id=actor_id, target_id=uid):
            skipped.append(_display_name(db, uid))
            continue
        db.add(ConversationMember(conversation_id=conv_id, user_id=uid, role="member"))
        added += 1
        added_ids.append(uid)
    db.commit()
    _welcome_new_members(db, conv, added_ids)
    return conv, added, skipped


def remove_group_member(
    db: Session,
    *,
    conv_id: int,
    actor_id: int,
    target_user_id: int,
    allow_self_leave: bool,
) -> tuple:
    """Returns ``(conv_or_None, message)``. ``conv`` is None when a sole owner
    leaves and the group is deleted (groups-router policy only)."""
    conv = _get_group(db, conv_id)
    my_mem = _membership(db, conv_id, actor_id)
    is_self_leave = target_user_id == actor_id
    if allow_self_leave:
        if not my_mem:
            raise forbidden("Not a member")
        if not is_self_leave and my_mem.role not in _MANAGER_ROLES:
            raise forbidden("Not authorized")
    else:
        if not my_mem or my_mem.role not in _MANAGER_ROLES:
            raise forbidden("Not authorized")
    target = _membership(db, conv_id, target_user_id)
    if not target:
        raise not_found("Member not found")
    if (
        target.role == "owner"
        and my_mem.role != "owner"
        and not (allow_self_leave and is_self_leave)
    ):
        raise forbidden("Cannot remove owner")
    if allow_self_leave and is_self_leave and target.role == "owner":
        others = (
            db.query(ConversationMember)
            .filter(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id != actor_id,
            )
            .order_by(ConversationMember.id.asc())
            .all()
        )
        if others:
            others[0].role = "owner"
        else:
            db.delete(target)
            db.query(ConversationMember).filter_by(conversation_id=conv_id).delete()
            db.query(Message).filter_by(conversation_id=conv_id).update(
                {"is_deleted": True}
            )
            for p in db.query(Poll).filter_by(conversation_id=conv_id).all():
                db.delete(p)
            db.delete(conv)
            db.commit()
            return None, "Group deleted"
    db.delete(target)
    db.commit()
    return conv, "Member removed"


def set_group_member_role(
    db: Session,
    *,
    conv_id: int,
    actor_id: int,
    target_user_id: int,
    role: str,
) -> tuple:
    """Owner-only role change. Returns ``(conv, normalized_role)``."""
    conv = _get_group(db, conv_id)
    my_mem = _membership(db, conv_id, actor_id)
    if not my_mem or my_mem.role != "owner":
        raise forbidden("Only the group owner can change roles")
    normalized = (role or "").lower()
    if normalized not in ("admin", "member"):
        raise bad_request("Role must be 'admin' or 'member'")
    target = _membership(db, conv_id, target_user_id)
    if not target:
        raise not_found("Member not found")
    if target.role == "owner" or target.user_id == actor_id:
        raise forbidden("Owner role cannot be changed")
    target.role = normalized
    db.commit()
    return conv, normalized


def _require_manager(db: Session, group_id: int, user_id: int) -> Conversation:
    conv = _get_group(db, group_id)
    mem = _membership(db, group_id, user_id)
    if not mem or mem.role not in _MANAGER_ROLES:
        raise forbidden("Not authorized")
    return conv


def get_invite_token(db: Session, *, group_id: int, actor_id: int) -> Optional[str]:
    conv = _require_manager(db, group_id, actor_id)
    return conv.invite_token


def rotate_invite_token(db: Session, *, group_id: int, actor_id: int) -> str:
    import secrets as _secrets

    conv = _require_manager(db, group_id, actor_id)
    for _ in range(3):
        conv.invite_token = _secrets.token_urlsafe(24)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
    else:
        from app.services.errors import ServiceError

        raise ServiceError(500, "Could not generate invite")
    return conv.invite_token


def disable_invite_token(db: Session, *, group_id: int, actor_id: int) -> None:
    conv = _require_manager(db, group_id, actor_id)
    conv.invite_token = None
    db.commit()


def join_group_by_token(db: Session, *, token: str, user_id: int) -> tuple:
    """Returns ``(conversation_id, already_member)``."""
    conv = (
        db.query(Conversation).filter_by(invite_token=token, is_group=True).first()
        if token
        else None
    )
    if not conv:
        raise not_found("Invalid or expired invite link")
    if _membership(db, conv.id, user_id):
        return conv.id, True
    db.add(ConversationMember(conversation_id=conv.id, user_id=user_id, role="member"))
    db.commit()
    _welcome_new_members(db, conv, [user_id])
    return conv.id, False
