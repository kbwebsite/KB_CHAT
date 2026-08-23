from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, desc, func
from typing import List, Optional
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message
from app.schemas.conversation import ConversationCreate, GroupUpdate
from app.schemas.common import success_response
from app.websocket.manager import manager

router = APIRouter(prefix="/api/conversations", tags=["conversations"])

def _is_member(db: Session, conv_id: int, user_id: int) -> bool:
    return db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=user_id).first() is not None

def _get_member_ids(db: Session, conv_id: int):
    return [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]

def conversation_to_dict(db: Session, conv: Conversation, current_user_id: int):
    members = db.query(ConversationMember).filter_by(conversation_id=conv.id).all()
    # load users
    member_out = []
    for m in members:
        u = db.query(User).filter_by(id=m.user_id).first()
        if not u:
            continue
        member_out.append({
            "id": m.id,
            "user_id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "role": m.role,
            "is_online": manager.is_online(u.id) if manager else u.is_online,
        })
    # last message
    last_msg = db.query(Message).filter_by(conversation_id=conv.id, is_deleted=False).order_by(desc(Message.created_at)).first()
    last_msg_dict = None
    if last_msg:
        sender = db.query(User).filter_by(id=last_msg.sender_id).first() if last_msg.sender_id else None
        last_msg_dict = {
            "id": last_msg.id,
            "content": "Message deleted" if last_msg.is_deleted else last_msg.content,
            "sender_id": last_msg.sender_id,
            "sender_username": sender.username if sender else None,
            "created_at": last_msg.created_at.isoformat() if last_msg.created_at else None,
            "message_type": last_msg.message_type,
        }
    # unread count: messages after last_read_message_id
    unread = 0
    my_membership = next((m for m in members if m.user_id == current_user_id), None)
    if my_membership and my_membership.last_read_message_id is not None:
        unread = db.query(Message).filter(
            Message.conversation_id == conv.id,
            Message.id > my_membership.last_read_message_id,
            Message.sender_id != current_user_id,
            Message.is_deleted == False
        ).count()
    elif my_membership:
        unread = db.query(Message).filter(
            Message.conversation_id == conv.id,
            Message.sender_id != current_user_id,
            Message.is_deleted == False
        ).count()

    # title/avatar logic for 1-1
    title = conv.title
    avatar = conv.avatar_url
    if not conv.is_group:
        other = None
        for m in members:
            if m.user_id != current_user_id:
                u = db.query(User).filter_by(id=m.user_id).first()
                if u:
                    other = u
                    break
        if other:
            title = other.display_name
            avatar = other.avatar_url
        else:
            title = title or "Unknown"

    return {
        "id": conv.id,
        "is_group": conv.is_group,
        "title": title,
        "description": conv.description,
        "avatar_url": avatar,
        "created_by": conv.created_by,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        "members": member_out,
        "last_message": last_msg_dict,
        "unread_count": unread,
        "is_muted": my_membership.is_muted if my_membership else False,
        "is_pinned": my_membership.is_pinned if my_membership and hasattr(my_membership, 'is_pinned') else False,
        "is_archived": my_membership.is_archived if my_membership and hasattr(my_membership, 'is_archived') else False,
    }

@router.get("")
def list_conversations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user), search: Optional[str] = Query(None), include_archived: bool = Query(False), filter: Optional[str] = Query(None)):
    # get conversation ids where user is member
    member_rows = db.query(ConversationMember).filter_by(user_id=current_user.id).all()
    # filter out archived if not included
    if not include_archived:
        member_rows = [r for r in member_rows if not getattr(r, 'is_archived', False)]
    # filter by pin/mute if requested
    if filter == "pinned":
        member_rows = [r for r in member_rows if getattr(r, 'is_pinned', False)]
    elif filter == "muted":
        member_rows = [r for r in member_rows if r.is_muted]
    elif filter == "unread":
        # will filter after dict
        pass
    conv_ids = [r.conversation_id for r in member_rows]
    if not conv_ids:
        return success_response([])
    query = db.query(Conversation).filter(Conversation.id.in_(conv_ids))
    convs = query.order_by(desc(Conversation.updated_at)).all()
    result = []
    for c in convs:
        d = conversation_to_dict(db, c, current_user.id)
        if search:
            s = search.lower()
            if s not in (d["title"] or "").lower() and s not in (d["description"] or "").lower():
                if not d["last_message"] or s not in (d["last_message"]["content"] or "").lower():
                    continue
        if filter == "unread" and d["unread_count"] == 0:
            continue
        result.append(d)
    # sort: pinned first, then by last message time
    result.sort(key=lambda x: (x.get("is_pinned", False), x["last_message"]["created_at"] if x["last_message"] else x["updated_at"] or ""), reverse=True)
    return success_response(result)

@router.post("")
async def create_conversation(payload: ConversationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.is_group:
        # Group creation
        if not payload.title or len(payload.title.strip()) < 1:
            raise HTTPException(status_code=400, detail="Group title required")
        conv = Conversation(
            is_group=True,
            title=payload.title.strip(),
            description=payload.description,
            created_by=current_user.id,
        )
        db.add(conv)
        db.flush()
        # add creator as owner
        owner = ConversationMember(conversation_id=conv.id, user_id=current_user.id, role="owner")
        db.add(owner)
        # add other members
        member_ids = set(payload.member_ids or [])
        if payload.member_usernames:
            for uname in payload.member_usernames:
                u = db.query(User).filter_by(username=uname.lower()).first()
                if u:
                    member_ids.add(u.id)
        for uid in member_ids:
            if uid == current_user.id:
                continue
            if not db.query(User).filter_by(id=uid).first():
                continue
            db.add(ConversationMember(conversation_id=conv.id, user_id=uid, role="member"))
        db.commit()
        db.refresh(conv)
        return success_response(conversation_to_dict(db, conv, current_user.id), "Group created")
    else:
        # 1-1
        target_user = None
        if payload.participant_id:
            target_user = db.query(User).filter_by(id=payload.participant_id).first()
        elif payload.participant_username:
            target_user = db.query(User).filter_by(username=payload.participant_username.lower()).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="Target user not found")
        if target_user.id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot create conversation with yourself")
        # check existing 1-1
        # find conversations where both are members and is_group False
        existing = db.query(Conversation).join(ConversationMember, Conversation.id == ConversationMember.conversation_id)\
            .filter(Conversation.is_group == False)\
            .filter(ConversationMember.user_id.in_([current_user.id, target_user.id]))\
            .all()
        # need to find conv that has exactly those 2 members
        for conv in existing:
            members = db.query(ConversationMember).filter_by(conversation_id=conv.id).all()
            mids = set(m.user_id for m in members)
            if mids == {current_user.id, target_user.id} and len(mids)==2:
                return success_response(conversation_to_dict(db, conv, current_user.id), "Conversation already exists")
        # create new
        conv = Conversation(is_group=False, created_by=current_user.id)
        db.add(conv)
        db.flush()
        db.add(ConversationMember(conversation_id=conv.id, user_id=current_user.id, role="member"))
        db.add(ConversationMember(conversation_id=conv.id, user_id=target_user.id, role="member"))
        db.commit()
        db.refresh(conv)
        return success_response(conversation_to_dict(db, conv, current_user.id), "Conversation created")

@router.get("/{conv_id}")
def get_conversation(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    return success_response(conversation_to_dict(db, conv, current_user.id))

@router.delete("/{conv_id}")
def delete_conversation(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    # For groups, only owner can delete? For now allow any member to leave (delete membership)
    # If group owner deletes, delete entire group. Otherwise just remove member.
    if conv.is_group:
        my_membership = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
        if my_membership and my_membership.role == "owner":
            db.delete(conv)
            db.commit()
            return success_response(None, "Group deleted")
        else:
            db.delete(my_membership)
            db.commit()
            # if no members left, delete conv
            remaining = db.query(ConversationMember).filter_by(conversation_id=conv_id).count()
            if remaining == 0:
                db.delete(conv)
                db.commit()
            return success_response(None, "Left conversation")
    else:
        # 1-1 delete for me? We'll delete membership, but keep conversation for other user until both left
        my_membership = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
        if my_membership:
            db.delete(my_membership)
            db.commit()
            remaining = db.query(ConversationMember).filter_by(conversation_id=conv_id).count()
            if remaining == 0:
                db.delete(conv)
                db.commit()
        return success_response(None, "Conversation deleted")

@router.patch("/groups/{conv_id}")
def update_group(conv_id: int, payload: GroupUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=conv_id, is_group=True).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    membership = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
    if not membership or membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if payload.title is not None:
        conv.title = payload.title
    if payload.description is not None:
        conv.description = payload.description
    if payload.avatar_url is not None:
        conv.avatar_url = payload.avatar_url
    db.commit()
    db.refresh(conv)
    return success_response(conversation_to_dict(db, conv, current_user.id), "Group updated")

@router.post("/groups/{conv_id}/members")
def add_group_members(conv_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=conv_id, is_group=True).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    membership = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
    if not membership or membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    user_ids = payload.get("user_ids") or []
    usernames = payload.get("usernames") or []
    for uname in usernames:
        u = db.query(User).filter_by(username=uname.lower()).first()
        if u and u.id not in user_ids:
            user_ids.append(u.id)
    added = []
    for uid in user_ids:
        if db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=uid).first():
            continue
        u = db.query(User).filter_by(id=uid).first()
        if not u:
            continue
        m = ConversationMember(conversation_id=conv_id, user_id=uid, role="member")
        db.add(m)
        added.append(uid)
    db.commit()
    return success_response(conversation_to_dict(db, conv, current_user.id), f"Added {len(added)} members")

@router.delete("/groups/{conv_id}/members/{user_id}")
def remove_group_member(conv_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=conv_id, is_group=True).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    my_mem = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
    if not my_mem or my_mem.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    target = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    # owner cannot be removed by admin? simple rule: only owner can remove admins
    if target.role == "owner" and my_mem.role != "owner":
        raise HTTPException(status_code=403, detail="Cannot remove owner")
    db.delete(target)
    db.commit()
    return success_response(conversation_to_dict(db, conv, current_user.id), "Member removed")

@router.post("/{conv_id}/read")
def mark_read(conv_id: int, payload: dict = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    # payload may contain last_message_id
    last_id = None
    if payload and "last_message_id" in payload:
        last_id = payload["last_message_id"]
    else:
        last_msg = db.query(Message).filter_by(conversation_id=conv_id).order_by(desc(Message.id)).first()
        if last_msg:
            last_id = last_msg.id
    membership = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
    if membership and last_id:
        membership.last_read_message_id = max(membership.last_read_message_id or 0, last_id)
        db.commit()
    return success_response({"last_read_message_id": last_id}, "Marked as read")

@router.post("/{conv_id}/unread")
def mark_unread(conv_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    membership = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
    if membership:
        membership.last_read_message_id = None
        db.commit()
    return success_response(None, "Marked as unread")

@router.post("/{conv_id}/pin")
def pin_conversation(conv_id: int, payload: dict = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    mem = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
    pinned = (payload or {}).get("pinned")
    if pinned is None:
        pinned = not getattr(mem, 'is_pinned', False)
    mem.is_pinned = bool(pinned)
    db.commit()
    return success_response({"is_pinned": mem.is_pinned}, "Pin updated")

@router.post("/{conv_id}/archive")
def archive_conversation(conv_id: int, payload: dict = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _is_member(db, conv_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")
    mem = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=current_user.id).first()
    archived = (payload or {}).get("archived")
    if archived is None:
        archived = not getattr(mem, 'is_archived', False)
    mem.is_archived = bool(archived)
    db.commit()
    return success_response({"is_archived": mem.is_archived}, "Archive updated")
