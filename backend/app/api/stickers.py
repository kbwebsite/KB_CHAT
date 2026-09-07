from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.sticker import StickerPack, Sticker, UserSticker
from app.schemas.common import success_response

router = APIRouter(prefix="/api", tags=["stickers"])

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
    packs = db.query(StickerPack).order_by(StickerPack.position).all()
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
                "stickers": [
                    {"id": s.id, "image_url": s.image_url, "emoji": s.emoji}
                    for s in stickers
                ],
            }
        )
    return success_response(result)


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
        us = UserSticker(
            user_id=current_user.id, sticker_id=sticker_id, is_favorite=True
        )
        db.add(us)
    else:
        us.is_favorite = not us.is_favorite
    db.commit()
    return success_response({"is_favorite": us.is_favorite}, "Updated")
