from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    is_group = Column(Boolean, default=False, nullable=False)
    title = Column(String(100), nullable=True)  # group name
    description = Column(Text, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    members = relationship("ConversationMember", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class ConversationMember(Base):
    __tablename__ = "conversation_members"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), default="member", nullable=False)  # owner, admin, member
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    last_read_message_id = Column(Integer, nullable=True)
    is_muted = Column(Boolean, default=False)
    is_pinned = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)

    conversation = relationship("Conversation", back_populates="members")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conversation_user"),
        Index("ix_conv_member_conv_user", "conversation_id", "user_id"),
        Index("ix_conv_member_user", "user_id"),
    )
