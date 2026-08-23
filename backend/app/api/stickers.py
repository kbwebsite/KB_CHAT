from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.sticker import StickerPack, Sticker, UserSticker
from app.schemas.common import success_response

router = APIRouter(prefix="/api", tags=["stickers"])

@router.get("/sticker-packs")
def list_packs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    packs = db.query(StickerPack).order_by(StickerPack.position).all()
    result = []
    for p in packs:
        stickers = db.query(Sticker).filter_by(pack_id=p.id).order_by(Sticker.position).all()
        result.append({
            "id": p.id, "name": p.name, "description": p.description,
            "thumbnail_url": p.thumbnail_url, "is_builtin": p.is_builtin,
            "stickers": [{"id": s.id, "image_url": s.image_url, "emoji": s.emoji} for s in stickers],
        })
    return success_response(result)

@router.get("/stickers/recent")
def recent_stickers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    us = db.query(UserSticker).filter_by(user_id=current_user.id).order_by(UserSticker.last_used.desc()).limit(24).all()
    result = []
    for u in us:
        s = db.query(Sticker).filter_by(id=u.sticker_id).first()
        if s:
            result.append({"id": s.id, "image_url": s.image_url, "emoji": s.emoji, "is_favorite": u.is_favorite})
    return success_response(result)

@router.post("/stickers/{sticker_id}/use")
def use_sticker(sticker_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(UserSticker).filter_by(user_id=current_user.id, sticker_id=sticker_id).first()
    if existing:
        existing.last_used = datetime.now(timezone.utc)
    else:
        db.add(UserSticker(user_id=current_user.id, sticker_id=sticker_id))
    db.commit()
    return success_response(None, "Recorded")

@router.post("/stickers/{sticker_id}/favorite")
def toggle_favorite_sticker(sticker_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    us = db.query(UserSticker).filter_by(user_id=current_user.id, sticker_id=sticker_id).first()
    if not us:
        us = UserSticker(user_id=current_user.id, sticker_id=sticker_id, is_favorite=True)
        db.add(us)
    else:
        us.is_favorite = not us.is_favorite
    db.commit()
    return success_response({"is_favorite": us.is_favorite}, "Updated")
