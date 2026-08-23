from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base

class StatusHighlight(Base):
    __tablename__ = "status_highlights"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(50), nullable=False)
    cover_status_id = Column(Integer, ForeignKey("statuses.id", ondelete="SET NULL"), nullable=True)
    position = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    items = relationship("StatusHighlightItem", back_populates="highlight", cascade="all, delete-orphan")

class StatusHighlightItem(Base):
    __tablename__ = "status_highlight_items"

    id = Column(Integer, primary_key=True, index=True)
    highlight_id = Column(Integer, ForeignKey("status_highlights.id", ondelete="CASCADE"), nullable=False, index=True)
    status_id = Column(Integer, ForeignKey("statuses.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, default=0)
    added_at = Column(DateTime(timezone=True), server_default=func.now())

    highlight = relationship("StatusHighlight", back_populates="items")
    status = relationship("Status")

    __table_args__ = (
        UniqueConstraint("highlight_id", "status_id", name="uq_highlight_status"),
    )
