from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.sticker import StickerPack, Sticker, UserSticker
from app.schemas.common import success_response

router = APIRouter(prefix="/api", tags=["stickers"])

MAX_PACK_STICKERS = 60

TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72"

BUILTIN_PACKS = [
    (
        "Smileys",
        "Everyday faces and gestures",
        [
            "😀",
            "😁",
            "😂",
            "🤣",
            "😊",
            "😍",
            "😎",
            "🤔",
            "😴",
            "😷",
            "🤯",
            "🥳",
            "😭",
            "😡",
            "👍",
            "👏",
            "🙏",
            "🔥",
            "🎉",
            "💯",
        ],
    ),
    (
        "Animals",
        "Cute animal stickers",
        [
            "🐶",
            "🐱",
            "🐭",
            "🐹",
            "🐰",
            "🦊",
            "🐻",
            "🐼",
            "🐨",
            "🐯",
            "🦁",
            "🐷",
            "🐸",
            "🐵",
            "🐔",
            "🐧",
        ],
    ),
    (
        "Food & Fun",
        "Snacks, drinks and vibes",
        [
            "🍎",
            "🍕",
            "🍔",
            "🍩",
            "🍦",
            "☕",
            "🎂",
            "🍓",
            "🥑",
            "🍉",
            "🍇",
            "⚽",
            "🎮",
            "🚀",
            "🌈",
            "❤️",
        ],
    ),
]


def _twemoji_url(emoji: str) -> str:
    codepoints = "-".join(f"{ord(ch):x}" for ch in emoji if ord(ch) != 0xFE0F)
    return f"{TWEMOJI_BASE}/{codepoints}.png"


def ensure_builtin_packs() -> None:
    """Seed emoji sticker packs on startup (idempotent).

    Uses Twemoji CDN art so packs work with zero uploaded assets.
    """
    from app.database.connection import SessionLocal

    db = SessionLocal()
    try:
        if db.query(StickerPack).filter_by(is_builtin=True).first():
            return
        for position, (name, description, emojis) in enumerate(BUILTIN_PACKS):
            pack = StickerPack(
                name=name,
                description=description,
                thumbnail_url=_twemoji_url(emojis[0]),
                is_builtin=True,
                position=position,
            )
            db.add(pack)
            db.flush()
            for i, em in enumerate(emojis):
                db.add(
                    Sticker(
                        pack_id=pack.id,
                        image_url=_twemoji_url(em),
                        emoji=em,
                        position=i,
                    )
                )
        db.commit()
        print(f"[stickers] seeded {len(BUILTIN_PACKS)} builtin packs")
    except Exception as e:
        db.rollback()
        print(f"[stickers] seed skipped: {e}")
    finally:
        db.close()


@router.get("/sticker-packs")
def list_packs(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    # Builtin packs are global; user packs are owner-scoped (never leaked
    # across accounts).
    packs = (
        db.query(StickerPack)
        .filter(
            or_(StickerPack.is_builtin == True, StickerPack.owner_id == current_user.id)
        )  # noqa: E712
        .order_by(StickerPack.position)
        .all()
    )
    result = []
    for p in packs:
        stickers = (
            db.query(Sticker).filter_by(pack_id=p.id).order_by(Sticker.position).all()
        )
        result.append(
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "thumbnail_url": p.thumbnail_url,
                "is_builtin": p.is_builtin,
                "is_owner": p.owner_id == current_user.id,
                "stickers": [
                    {"id": s.id, "image_url": s.image_url, "emoji": s.emoji}
                    for s in stickers
                ],
            }
        )
    return success_response(result)


def _owned_pack(db: Session, pack_id: int, user_id: int) -> StickerPack:
    """Owner-scoped lookup; missing and foreign packs share one 404 so
    pack existence never leaks across accounts."""
    p = db.query(StickerPack).filter_by(id=pack_id, owner_id=user_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pack not found")
    return p


@router.post("/sticker-packs")
def create_pack(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = str(payload.get("name") or "").strip()[:100]
    if not name:
        raise HTTPException(status_code=400, detail="Pack name required")
    position = db.query(StickerPack).filter_by(owner_id=current_user.id).count()
    p = StickerPack(
        name=name, owner_id=current_user.id, is_builtin=False, position=position
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return success_response(
        {
            "id": p.id,
            "name": p.name,
            "is_builtin": False,
            "is_owner": True,
            "stickers": [],
        },
        "Pack created",
    )


@router.post("/sticker-packs/{pack_id}/stickers")
def add_pack_sticker(
    pack_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = _owned_pack(db, pack_id, current_user.id)
    url = str(payload.get("image_url") or "").strip()
    if not url.startswith(("http://", "https://")) or len(url) > 500:
        raise HTTPException(status_code=400, detail="Valid image_url required")
    if db.query(Sticker).filter_by(pack_id=p.id).count() >= MAX_PACK_STICKERS:
        raise HTTPException(
            status_code=400, detail=f"Pack is full ({MAX_PACK_STICKERS} stickers)"
        )
    emoji = payload.get("emoji")
    s = Sticker(
        pack_id=p.id,
        image_url=url,
        emoji=str(emoji)[:20] if emoji else None,
        position=db.query(Sticker).filter_by(pack_id=p.id).count(),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return success_response(
        {"id": s.id, "image_url": s.image_url, "emoji": s.emoji}, "Sticker added"
    )


@router.delete("/sticker-packs/{pack_id}")
def delete_pack(
    pack_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = _owned_pack(db, pack_id, current_user.id)
    db.delete(p)
    db.commit()
    return success_response(None, "Pack deleted")


@router.get("/stickers/recent")
def recent_stickers(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    us = (
        db.query(UserSticker)
        .filter_by(user_id=current_user.id)
        .order_by(UserSticker.last_used.desc())
        .limit(24)
        .all()
    )
    result = []
    for u in us:
        s = db.query(Sticker).filter_by(id=u.sticker_id).first()
        if s:
            result.append(
                {
                    "id": s.id,
                    "image_url": s.image_url,
                    "emoji": s.emoji,
                    "is_favorite": u.is_favorite,
                }
            )
    return success_response(result)


@router.post("/stickers/{sticker_id}/use")
def use_sticker(
    sticker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(Sticker).filter_by(id=sticker_id).first():
        raise HTTPException(status_code=404, detail="Sticker not found")
    existing = (
        db.query(UserSticker)
        .filter_by(user_id=current_user.id, sticker_id=sticker_id)
        .first()
    )
    if existing:
        existing.last_used = datetime.now(timezone.utc)
    else:
        db.add(UserSticker(user_id=current_user.id, sticker_id=sticker_id))
    db.commit()
    return success_response(None, "Recorded")


@router.post("/stickers/{sticker_id}/favorite")
def toggle_favorite_sticker(
    sticker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    us = (
        db.query(UserSticker)
        .filter_by(user_id=current_user.id, sticker_id=sticker_id)
        .first()
    )
    if not us:
        if not db.query(Sticker).filter_by(id=sticker_id).first():
            raise HTTPException(status_code=404, detail="Sticker not found")
        us = UserSticker(
            user_id=current_user.id, sticker_id=sticker_id, is_favorite=True
        )
        db.add(us)
    else:
        us.is_favorite = not us.is_favorite
    db.commit()
    return success_response({"is_favorite": us.is_favorite}, "Updated")
