"""Full account backup & restore (v1).

Closes the README limitation "No message backup/export beyond
per-conversation text export":

- GET /api/backup/export -> one JSON document with profile + settings +
  every conversation the user belongs to (members + messages + attachment
  metadata). File blobs themselves are NOT embedded (only metadata +
  Cloudinary URLs when present) - the export notes this honestly.
- POST /api/backup/restore -> merge a previously exported document back:
  restores profile + settings, recreates missing 1-1 shells / owned groups,
  and re-inserts messages that are not already present (dedupe by
  sender + content + timestamp). Never deletes anything - it only adds
  what is missing, so it is safe to run twice.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Attachment, Message
from app.models.settings import UserSettings
from app.models.user import BlockedUser, User
from app.schemas.common import success_response

router = APIRouter(prefix="/api/backup", tags=["backup"])

BACKUP_VERSION = 1
# Safety caps: a single account export stays one HTTP response.
MAX_CONVS = 500
MAX_MSGS_PER_CONV = 5000

SETTINGS_FIELDS = [
    "theme",
    "accent_color",
    "chat_wallpaper",
    "message_notifications",
    "sound_enabled",
    "desktop_notifications",
    "is_muted",
    "notification_previews",
    "online_status_visible",
    "read_receipts",
    "last_seen_visible",
    "enter_to_send",
    "media_auto_download",
    "default_disappearing",
    "silence_unknown_callers",
    "group_add_privacy",
]


def _settings_to_dict(s: UserSettings | None) -> dict:
    if not s:
        return {}
    return {k: getattr(s, k, None) for k in SETTINGS_FIELDS}


def _iso(dt) -> str | None:
    try:
        return dt.isoformat() if dt else None
    except Exception:
        return None


@router.get("/export")
def export_backup(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    memberships = db.query(ConversationMember).filter_by(user_id=current_user.id).all()
    conv_ids = [m.conversation_id for m in memberships[:MAX_CONVS]]
    convs = (
        db.query(Conversation).filter(Conversation.id.in_(conv_ids)).all()
        if conv_ids
        else []
    )

    # Batch users + members.
    all_members = (
        db.query(ConversationMember)
        .filter(ConversationMember.conversation_id.in_(conv_ids))
        .all()
        if conv_ids
        else []
    )
    user_ids = {m.user_id for m in all_members}
    user_ids.add(current_user.id)
    users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(list(user_ids))).all()}
        if user_ids
        else {}
    )

    members_by_conv: dict[int, list] = {}
    for m in all_members:
        members_by_conv.setdefault(m.conversation_id, []).append(m)

    out_convs = []
    total_messages = 0
    for c in convs:
        msgs = (
            db.query(Message)
            .filter_by(conversation_id=c.id)
            .order_by(desc(Message.id))
            .limit(MAX_MSGS_PER_CONV + 1)
            .all()
        )
        truncated = len(msgs) > MAX_MSGS_PER_CONV
        msgs = msgs[:MAX_MSGS_PER_CONV]
        msgs.reverse()
        total_messages += len(msgs)
        msg_ids = [m.id for m in msgs]
        atts_by_msg: dict[int, list] = {}
        if msg_ids:
            for a in (
                db.query(Attachment).filter(Attachment.message_id.in_(msg_ids)).all()
            ):
                atts_by_msg.setdefault(a.message_id, []).append(a)
        out_msgs = []
        for m in msgs:
            sender = users.get(m.sender_id) if m.sender_id else None
            out_msgs.append(
                {
                    "sender_id": m.sender_id,
                    "sender_username": sender.username if sender else None,
                    "sender_display_name": sender.display_name if sender else None,
                    "content": m.content,
                    "message_type": m.message_type,
                    "is_edited": bool(m.is_edited),
                    "is_deleted": bool(m.is_deleted),
                    "is_pinned": bool(m.is_pinned),
                    "created_at": _iso(m.created_at),
                    "attachments": [
                        {
                            "original_filename": a.original_filename,
                            "mime_type": a.mime_type,
                            "file_size": a.file_size,
                            "cloudinary_url": a.cloudinary_url,
                        }
                        for a in atts_by_msg.get(m.id, [])
                    ],
                }
            )
        mem_out = []
        for m in members_by_conv.get(c.id, []):
            u = users.get(m.user_id)
            if not u:
                continue
            mem_out.append(
                {
                    "user_id": u.id,
                    "username": u.username,
                    "display_name": u.display_name,
                    "role": m.role,
                }
            )
        my_mem = next(
            (m for m in members_by_conv.get(c.id, []) if m.user_id == current_user.id),
            None,
        )
        out_convs.append(
            {
                "is_group": bool(c.is_group),
                "title": c.title,
                "description": c.description,
                "avatar_url": c.avatar_url,
                "created_at": _iso(c.created_at),
                "my_role": my_mem.role if my_mem else None,
                "members": mem_out,
                "messages": out_msgs,
                "truncated": truncated,
            }
        )

    settings = db.query(UserSettings).filter_by(user_id=current_user.id).first()
    blocked = db.query(BlockedUser).filter_by(blocker_id=current_user.id).all()
    blocked_usernames = []
    for b in blocked:
        u = users.get(b.blocked_id) or db.query(User).filter_by(id=b.blocked_id).first()
        if u:
            blocked_usernames.append(u.username)

    return success_response(
        {
            "version": BACKUP_VERSION,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "app": "kryzen",
            "user": {
                "username": current_user.username,
                "display_name": current_user.display_name,
                "email": current_user.email,
                "avatar_url": current_user.avatar_url,
                "about": current_user.about,
                "status_message": current_user.status_message,
            },
            "settings": _settings_to_dict(settings),
            "blocked_usernames": blocked_usernames,
            "conversations": out_convs,
            "counts": {
                "conversations": len(out_convs),
                "messages": total_messages,
            },
            "notes": [
                "File blobs are not embedded; attachments carry metadata + Cloudinary URL when present.",
                f"Capped at {MAX_CONVS} conversations / {MAX_MSGS_PER_CONV} messages per conversation; truncated flags mark cuts.",
            ],
        }
    )


@router.post("/restore")
def restore_backup(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid backup file")
    data = payload.get("backup") if isinstance(payload.get("backup"), dict) else payload
    if not isinstance(data, dict) or "conversations" not in data:
        raise HTTPException(status_code=400, detail="Not a Kryzen backup file")
    if data.get("app") not in (None, "kryzen", "kb-chat", "KB-CHAT"):
        raise HTTPException(status_code=400, detail="Unknown backup format")

    restored_profile = False
    restored_settings = False
    convs_restored = 0
    msgs_restored = 0

    # 1. Profile (safe fields only - never username/email/password).
    uinfo = data.get("user") or {}
    if isinstance(uinfo, dict):
        changed = False
        for field in ("display_name", "about", "avatar_url", "status_message"):
            if field in uinfo and uinfo[field] is not None:
                val = (
                    str(uinfo[field])[:500]
                    if isinstance(uinfo[field], str)
                    else uinfo[field]
                )
                if getattr(current_user, field, None) != val:
                    setattr(current_user, field, val)
                    changed = True
        if changed:
            restored_profile = True

    # 2. Settings (whitelist).
    sinfo = data.get("settings") or {}
    if isinstance(sinfo, dict):
        s = db.query(UserSettings).filter_by(user_id=current_user.id).first()
        if not s:
            s = UserSettings(user_id=current_user.id)
            db.add(s)
            db.flush()
        for k in SETTINGS_FIELDS:
            if k in sinfo and sinfo[k] is not None:
                try:
                    setattr(s, k, sinfo[k])
                    restored_settings = True
                except Exception:
                    continue

    # 3. Conversations + messages (merge-only, never delete).
    def _parse_dt(v: Any):
        if not v:
            return None
        try:
            dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None

    for bc in (data.get("conversations") or [])[:MAX_CONVS]:
        if not isinstance(bc, dict):
            continue
        is_group = bool(bc.get("is_group"))
        bmsgs = bc.get("messages") or []
        if not isinstance(bmsgs, list):
            bmsgs = []
        target_conv: Conversation | None = None

        if not is_group:
            # 1-1: find the other participant by username.
            other_name = None
            for m in bc.get("members") or []:
                un = (m.get("username") or "").lower()
                if un and un != (current_user.username or "").lower():
                    other_name = un
                    break
            if not other_name:
                # Fallback: sender of first non-own message.
                for m in bmsgs:
                    un = (m.get("sender_username") or "").lower()
                    if un and un != (current_user.username or "").lower():
                        other_name = un
                        break
            if not other_name:
                continue
            other = db.query(User).filter_by(username=other_name).first()
            if not other:
                continue
            # Existing 1-1 shell?
            my_cids = {
                r.conversation_id
                for r in db.query(ConversationMember)
                .filter_by(user_id=current_user.id)
                .all()
            }
            other_cids = {
                r.conversation_id
                for r in db.query(ConversationMember).filter_by(user_id=other.id).all()
            }
            for cid in my_cids & other_cids:
                c = db.query(Conversation).filter_by(id=cid, is_group=False).first()
                if c:
                    mems = (
                        db.query(ConversationMember)
                        .filter_by(conversation_id=cid)
                        .all()
                    )
                    if {m.user_id for m in mems} == {current_user.id, other.id}:
                        target_conv = c
                        break
            if target_conv is None:
                target_conv = Conversation(is_group=False, created_by=current_user.id)
                db.add(target_conv)
                db.flush()
                db.add(
                    ConversationMember(
                        conversation_id=target_conv.id,
                        user_id=current_user.id,
                        role="member",
                    )
                )
                db.add(
                    ConversationMember(
                        conversation_id=target_conv.id, user_id=other.id, role="member"
                    )
                )
                db.flush()
                convs_restored += 1
        else:
            # Group: only recreate groups the restorer owned (avoids forging
            # someone else's group). Join other groups via invite links.
            if (bc.get("my_role") or "") != "owner":
                # Still import messages into a same-titled owned group if one
                # exists (e.g. same device, group still there).
                title = (bc.get("title") or "").strip()
                if not title:
                    continue
                target_conv = (
                    db.query(Conversation)
                    .filter_by(title=title, is_group=True, created_by=current_user.id)
                    .first()
                )
                if target_conv is None:
                    continue
            else:
                title = (
                    bc.get("title") or "Restored group"
                ).strip() or "Restored group"
                target_conv = (
                    db.query(Conversation)
                    .filter_by(title=title, is_group=True, created_by=current_user.id)
                    .first()
                )
                if target_conv is None:
                    target_conv = Conversation(
                        is_group=True,
                        title=title[:100],
                        description=(bc.get("description") or None),
                        avatar_url=(bc.get("avatar_url") or None),
                        created_by=current_user.id,
                    )
                    db.add(target_conv)
                    db.flush()
                    db.add(
                        ConversationMember(
                            conversation_id=target_conv.id,
                            user_id=current_user.id,
                            role="owner",
                        )
                    )
                    # Re-add members that still exist.
                    for m in bc.get("members") or []:
                        un = (m.get("username") or "").lower()
                        if not un:
                            continue
                        u = db.query(User).filter_by(username=un).first()
                        if not u or u.id == current_user.id:
                            continue
                        if (
                            db.query(ConversationMember)
                            .filter_by(conversation_id=target_conv.id, user_id=u.id)
                            .first()
                        ):
                            continue
                        role = (
                            m.get("role")
                            if m.get("role") in ("admin", "member")
                            else "member"
                        )
                        db.add(
                            ConversationMember(
                                conversation_id=target_conv.id, user_id=u.id, role=role
                            )
                        )
                    db.flush()
                    convs_restored += 1

        if target_conv is None:
            continue
        # Insert missing messages (dedupe by sender + content + timestamp).
        existing = {
            (
                (m.sender_id or 0),
                (m.content or "")[:200],
                (m.created_at.isoformat() if m.created_at else ""),
            )
            for m in db.query(Message).filter_by(conversation_id=target_conv.id).all()
        }
        # Map backup sender username -> real user id (None stays None/system).
        sender_cache: dict[str, int | None] = {}
        for bm in bmsgs[:MAX_MSGS_PER_CONV]:
            if not isinstance(bm, dict):
                continue
            content = bm.get("content") or ""
            if not content and not (bm.get("attachments") or []):
                continue
            if len(content) > 5000:
                content = content[:5000]
            sun = (bm.get("sender_username") or "").lower()
            if sun not in sender_cache:
                if not sun or sun in ("unknown",):
                    sender_cache[sun] = None
                else:
                    su = db.query(User).filter_by(username=sun).first()
                    # Only keep senders that belong to this conversation.
                    if (
                        su
                        and db.query(ConversationMember)
                        .filter_by(conversation_id=target_conv.id, user_id=su.id)
                        .first()
                    ):
                        sender_cache[sun] = su.id
                    elif su and su.id == current_user.id:
                        sender_cache[sun] = su.id
                    else:
                        sender_cache[sun] = None if not is_group else current_user.id
            sid = sender_cache[sun]
            created = _parse_dt(bm.get("created_at")) or datetime.now(timezone.utc)
            key = ((sid or 0), content[:200], created.isoformat())
            if key in existing:
                continue
            nm = Message(
                conversation_id=target_conv.id,
                sender_id=sid,
                content=content,
                message_type=bm.get("message_type") or "text",
                is_edited=bool(bm.get("is_edited")),
                created_at=created,
            )
            # Preserve pinned state when present.
            if bm.get("is_pinned"):
                nm.is_pinned = True
            db.add(nm)
            existing.add(key)
            msgs_restored += 1
        target_conv.updated_at = datetime.now(timezone.utc)

    db.commit()
    return success_response(
        {
            "restored_profile": restored_profile,
            "restored_settings": restored_settings,
            "conversations_restored": convs_restored,
            "messages_restored": msgs_restored,
        },
        f"Restore complete: {msgs_restored} messages, {convs_restored} new chats",
    )
