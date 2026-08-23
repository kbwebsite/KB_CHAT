from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base

class Status(Base):
    __tablename__ = "statuses"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=True)  # text status
    media_url = Column(String(500), nullable=True)
    media_type = Column(String(20), default="text")  # text, image, video
    background = Column(String(50), nullable=True)  # for text status
    caption = Column(Text, nullable=True)
    privacy = Column(String(20), default="contacts")  # contacts, selected, nobody
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    viewers = relationship("StatusViewer", back_populates="status", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_status_user_created", "user_id", "created_at"),
    )

class StatusViewer(Base):
    __tablename__ = "status_viewers"
    id = Column(Integer, primary_key=True, index=True)
    status_id = Column(Integer, ForeignKey("statuses.id", ondelete="CASCADE"), nullable=False, index=True)
    viewer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    viewed_at = Column(DateTime(timezone=True), server_default=func.now())

    status = relationship("Status", back_populates="viewers")
    viewer = relationship("User")

    __table_args__ = (
        Index("ix_status_viewer_status_viewer", "status_id", "viewer_id"),
    )
