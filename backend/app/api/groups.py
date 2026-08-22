from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import success_response
from app.api.conversations import conversation_to_dict
from app.models.conversation import Conversation, ConversationMember
from app.models.user import User as UserModel

router = APIRouter(prefix="/api/groups", tags=["groups"])

@router.post("")
def create_group(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # payload: {title, description, member_ids, member_usernames}
    title = payload.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Group title required")
    conv = Conversation(is_group=True, title=title.strip(), description=payload.get("description"), created_by=current_user.id)
    db.add(conv)
    db.flush()
    db.add(ConversationMember(conversation_id=conv.id, user_id=current_user.id, role="owner"))
    member_ids = set(payload.get("member_ids") or [])
    for uname in (payload.get("member_usernames") or []):
        u = db.query(UserModel).filter_by(username=uname.lower()).first()
        if u:
            member_ids.add(u.id)
    for uid in member_ids:
        if uid == current_user.id: continue
        if not db.query(UserModel).filter_by(id=uid).first(): continue
        db.add(ConversationMember(conversation_id=conv.id, user_id=uid, role="member"))
    db.commit()
    db.refresh(conv)
    return success_response(conversation_to_dict(db, conv, current_user.id), "Group created")

@router.patch("/{group_id}")
def update_group(group_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=group_id, is_group=True).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    membership = db.query(ConversationMember).filter_by(conversation_id=group_id, user_id=current_user.id).first()
    if not membership or membership.role not in ("owner","admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if "title" in payload and payload["title"]:
        conv.title = payload["title"]
    if "description" in payload:
        conv.description = payload["description"]
    if "avatar_url" in payload:
        conv.avatar_url = payload["avatar_url"]
    db.commit()
    db.refresh(conv)
    return success_response(conversation_to_dict(db, conv, current_user.id), "Group updated")

@router.post("/{group_id}/members")
def add_members(group_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=group_id, is_group=True).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    membership = db.query(ConversationMember).filter_by(conversation_id=group_id, user_id=current_user.id).first()
    if not membership or membership.role not in ("owner","admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    user_ids = payload.get("user_ids") or []
    for uname in (payload.get("usernames") or []):
        u = db.query(UserModel).filter_by(username=uname.lower()).first()
        if u and u.id not in user_ids:
            user_ids.append(u.id)
    added=[]
    for uid in user_ids:
        if db.query(ConversationMember).filter_by(conversation_id=group_id, user_id=uid).first():
            continue
        u = db.query(UserModel).filter_by(id=uid).first()
        if not u: continue
        db.add(ConversationMember(conversation_id=group_id, user_id=uid, role="member"))
        added.append(uid)
    db.commit()
    return success_response(conversation_to_dict(db, conv, current_user.id), f"Added {len(added)} members")

@router.delete("/{group_id}/members/{user_id}")
def remove_member(group_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=group_id, is_group=True).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    my_mem = db.query(ConversationMember).filter_by(conversation_id=group_id, user_id=current_user.id).first()
    if not my_mem or my_mem.role not in ("owner","admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    target = db.query(ConversationMember).filter_by(conversation_id=group_id, user_id=user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == "owner" and my_mem.role != "owner":
        raise HTTPException(status_code=403, detail="Cannot remove owner")
    db.delete(target)
    db.commit()
    return success_response(conversation_to_dict(db, conv, current_user.id), "Member removed")
