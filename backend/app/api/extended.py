from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message, Attachment
from app.auth.security import hash_password, verify_password
from app.schemas.common import success_response
import json

router = APIRouter(prefix="/api", tags=["extended"])

# Change password
@router.patch("/users/me/password")
def change_password(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current = payload.get("current_password")
    new = payload.get("new_password")
    if not current or not new:
        raise HTTPException(status_code=400, detail="Both passwords required")
    if len(new) < 6:
        raise HTTPException(status_code=400, detail="New password too short")
    if not verify_password(current, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    current_user.hashed_password = hash_password(new)
    db.commit()
    return success_response(None, "Password updated")

# Forward message
@router.post("/messages/{message_id}/forward")
async def forward_message(message_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter_by(id=message_id).first()
    if not msg or msg.is_deleted:
        raise HTTPException(status_code=404, detail="Message not found")
    # check current user is member of original conversation
    if not db.query(ConversationMember).filter_by(conversation_id=msg.conversation_id, user_id=current_user.id).first():
        raise HTTPException(status_code=403, detail="Not member of original")
    target_ids = payload.get("conversation_ids") or []
    if not target_ids and payload.get("conversation_id"):
        target_ids = [payload.get("conversation_id")]
    if not target_ids:
        raise HTTPException(status_code=400, detail="Target conversation required")
    created=[]
    for cid in target_ids:
        if not db.query(ConversationMember).filter_by(conversation_id=cid, user_id=current_user.id).first():
            continue
        new_msg = Message(
            conversation_id=cid,
            sender_id=current_user.id,
            content=msg.content,
            message_type=msg.message_type,
        )
        db.add(new_msg)
        db.flush()
        # copy attachments metadata? For now just reference original? We copy attachments if any
        for att in db.query(Attachment).filter_by(message_id=msg.id).all():
            new_att = Attachment(
                message_id=new_msg.id,
                uploader_id=current_user.id,
                filename=att.filename,
                original_filename=att.original_filename,
                file_path=att.file_path,
                file_size=att.file_size,
                mime_type=att.mime_type,
            )
            db.add(new_att)
        # update conv
        conv = db.query(Conversation).filter_by(id=cid).first()
        if conv:
            conv.updated_at = datetime.now(timezone.utc)
        created.append(cid)
    db.commit()
    # broadcast each
    from app.websocket.manager import manager
    for cid in created:
        # get last message in that conv (the forwarded one)
        last = db.query(Message).filter_by(conversation_id=cid).order_by(desc(Message.id)).first()
        if last:
            sender = db.query(User).filter_by(id=last.sender_id).first()
            payload_ws = {
                "id": last.id,
                "conversation_id": last.conversation_id,
                "sender_id": last.sender_id,
                "sender_username": sender.username if sender else None,
                "sender_display_name": sender.display_name if sender else None,
                "sender_avatar": sender.avatar_url if sender else None,
                "content": last.content,
                "message_type": last.message_type,
                "reply_to_id": None,
                "is_deleted": False,
                "is_edited": False,
                "created_at": last.created_at.isoformat() if last.created_at else None,
                "updated_at": last.updated_at.isoformat() if last.updated_at else None,
                "attachments": [],
                "reactions": [],
                "status": "sent",
            }
            member_ids = [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=cid).all()]
            await manager.broadcast_to_conversation(cid, {"type": "message.new", "payload": payload_ws}, member_ids=member_ids)
    return success_response({"forwarded_to": created}, f"Forwarded to {len(created)} conversations")

# Clear chat
@router.post("/conversations/{conv_id}/clear")
def clear_chat(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first():
        raise HTTPException(status_code=403, detail="Not a member")
    # delete all messages in conversation for this user? For V1, delete all messages where conversation_id matches
    # But to support per-user clear, we just delete all messages (since we don't have per-user hide)
    # Add confirmation: require payload? We just clear
    count = db.query(Message).filter_by(conversation_id=conv_id).delete()
    db.commit()
    # also delete attachments? cascade
    return success_response({"deleted_count": count}, "Chat cleared")

# Export chat
@router.get("/conversations/{conv_id}/export")
def export_chat(conv_id: int, format: str = Query("json", pattern="^(json|txt)$"), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first():
        raise HTTPException(status_code=403, detail="Not a member")
    msgs = db.query(Message).filter_by(conversation_id=conv_id).order_by(Message.created_at).all()
    members = db.query(ConversationMember).filter_by(conversation_id=conv_id).all()
    # Build export data without sensitive info
    export_members = []
    for m in members:
        u = db.query(User).filter_by(id=m.user_id).first()
        if u:
            export_members.append({"username": u.username, "display_name": u.display_name, "role": m.role})
    export_msgs=[]
    for msg in msgs:
        sender = db.query(User).filter_by(id=msg.sender_id).first() if msg.sender_id else None
        atts = db.query(Attachment).filter_by(message_id=msg.id).all()
        export_msgs.append({
            "sender": sender.username if sender else "Unknown",
            "display_name": sender.display_name if sender else "Unknown",
            "content": msg.content if not msg.is_deleted else "Message deleted",
            "message_type": msg.message_type,
            "timestamp": msg.created_at.isoformat() if msg.created_at else None,
            "attachments": [{"filename": a.original_filename, "mime_type": a.mime_type, "size": a.file_size} for a in atts],
            "is_edited": msg.is_edited,
        })
    if format == "txt":
        lines=[]
        lines.append(f"KB Chat Export - Conversation {conv_id}")
        lines.append(f"Exported at: {datetime.now(timezone.utc).isoformat()}")
        lines.append(f"Is Group: {conv.is_group}, Title: {conv.title or 'Direct'}")
        lines.append(f"Members: {', '.join([m['display_name'] for m in export_members])}")
        lines.append("-"*40)
        for em in export_msgs:
            lines.append(f"[{em['timestamp']}] {em['display_name']} (@{em['sender']}): {em['content']}")
            if em['attachments']:
                for a in em['attachments']:
                    lines.append(f"  [Attachment: {a['filename']} ({a['mime_type']}, {a['size']} bytes)]")
        txt_content = "\n".join(lines)
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(txt_content, headers={"Content-Disposition": f"attachment; filename=kbchat_{conv_id}.txt"})
    else:
        return success_response({
            "conversation": {"id": conv.id, "is_group": conv.is_group, "title": conv.title, "members": export_members},
            "messages": export_msgs,
            "exported_at": datetime.now(timezone.utc).isoformat(),
        })

# Conversation mute
@router.post("/conversations/{conv_id}/mute")
def mute_conversation(conv_id: int, payload: dict = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    mem = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
    if not mem:
        raise HTTPException(status_code=403, detail="Not a member")
    data = payload or {}
    muted = data.get("muted", True)
    mem.is_muted = bool(muted)
    mem.muted_until = None
    if muted and data.get("duration"):
        from datetime import datetime, timedelta, timezone
        durations = {"1h": 1, "8h": 8, "24h": 24, "7d": 168}
        hours = durations.get(data["duration"], 0)
        if hours > 0:
            mem.muted_until = datetime.now(timezone.utc) + timedelta(hours=hours)
    db.commit()
    return success_response({"is_muted": mem.is_muted, "muted_until": mem.muted_until.isoformat() if mem.muted_until else None}, "Mute updated")

# Profile status
@router.post("/users/me/status")
def set_profile_status(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    status_msg = payload.get("status_message", "").strip()
    if len(status_msg) > 100:
        raise HTTPException(status_code=400, detail="Status too long")
    current_user.status_message = status_msg or None
    current_user.status_expires_at = None
    if payload.get("expires_in"):
        from datetime import datetime, timedelta, timezone
        expires_map = {"1h": 1, "today": 24, "7d": 168}
        hours = expires_map.get(payload["expires_in"], 0)
        if hours > 0:
            current_user.status_expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)
    db.commit()
    return success_response({"status_message": current_user.status_message, "status_expires_at": current_user.status_expires_at.isoformat() if current_user.status_expires_at else None}, "Status updated")

# Favorites
@router.post("/contacts/{user_id}/favorite")
def toggle_favorite(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.conversation import ConversationMember, Conversation
    # Find 1-1 conversation between current user and target
    my_convs = [m.conversation_id for m in db.query(ConversationMember).filter_by(user_id=current_user.id).all()]
    target_convs = [m.conversation_id for m in db.query(ConversationMember).filter_by(user_id=user_id).all()]
    shared = set(my_convs) & set(target_convs)
    conv = None
    for cid in shared:
        c = db.query(Conversation).filter_by(id=cid, is_group=False).first()
        if c:
            conv = c
            break
    if not conv:
        raise HTTPException(status_code=404, detail="No conversation found")
    mem = db.query(ConversationMember).filter_by(conversation_id=conv.id, user_id=current_user.id).first()
    mem.is_favorite = not mem.is_favorite
    db.commit()
    return success_response({"is_favorite": mem.is_favorite}, "Updated")

@router.get("/contacts/favorites")
def get_favorites(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    member_convs = [m.conversation_id for m in db.query(ConversationMember).filter_by(user_id=current_user.id, is_favorite=True).all()]
    if not member_convs:
        return success_response([])
    other_members = db.query(ConversationMember).filter(ConversationMember.conversation_id.in_(member_convs), ConversationMember.user_id != current_user.id).all()
    user_ids = list(set(m.user_id for m in other_members))
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    return success_response([{
        "id": u.id, "username": u.username, "display_name": u.display_name,
        "avatar_url": u.avatar_url, "is_online": u.is_online,
    } for u in users])

# Get contacts (all users that have had conversation with current user or all users)
@router.get("/contacts")
def get_contacts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # contacts = users who share a conversation
    member_convs = [m.conversation_id for m in db.query(ConversationMember).filter_by(user_id=current_user.id).all()]
    if not member_convs:
        return success_response([])
    other_members = db.query(ConversationMember).filter(ConversationMember.conversation_id.in_(member_convs), ConversationMember.user_id != current_user.id).all()
    user_ids = list(set(m.user_id for m in other_members))
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    result=[]
    for u in users:
        result.append({
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "about": u.about,
            "is_online": u.is_online,
            "last_seen": u.last_seen.isoformat() if u.last_seen else None,
        })
    return success_response(result)

# Mark notification read etc. For now simple
@router.post("/notifications/mark-read")
def mark_notifications_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # In V1, just mark all convs as read
    for mem in db.query(ConversationMember).filter_by(user_id=current_user.id).all():
        last_msg = db.query(Message).filter_by(conversation_id=mem.conversation_id).order_by(desc(Message.id)).first()
        if last_msg:
            mem.last_read_message_id = last_msg.id
    db.commit()
    return success_response(None, "All marked read")
