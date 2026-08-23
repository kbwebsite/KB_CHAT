from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base

class StickerPack(Base):
    __tablename__ = "sticker_packs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    is_builtin = Column(Boolean, default=False)
    position = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    stickers = relationship("Sticker", back_populates="pack", cascade="all, delete-orphan")

class Sticker(Base):
    __tablename__ = "stickers"

    id = Column(Integer, primary_key=True, index=True)
    pack_id = Column(Integer, ForeignKey("sticker_packs.id", ondelete="CASCADE"), nullable=False, index=True)
    image_url = Column(String(500), nullable=False)
    emoji = Column(String(20), nullable=True)
    position = Column(Integer, default=0)

    pack = relationship("StickerPack", back_populates="stickers")

class UserSticker(Base):
    __tablename__ = "user_stickers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sticker_id = Column(Integer, ForeignKey("stickers.id", ondelete="CASCADE"), nullable=False, index=True)
    is_favorite = Column(Boolean, default=False)
    last_used = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    sticker = relationship("Sticker")
