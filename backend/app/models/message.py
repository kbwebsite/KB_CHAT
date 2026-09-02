from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    content = Column(Text, nullable=True)
    message_type = Column(
        String(20), default="text", nullable=False
    )  # text, image, file, system
    reply_to_id = Column(Integer, ForeignKey("messages.id"), nullable=True, index=True)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    is_edited = Column(Boolean, default=False, nullable=False)
    is_pinned = Column(Boolean, default=False, nullable=False, index=True)
    pinned_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])
    reply_to = relationship("Message", remote_side=[id], foreign_keys=[reply_to_id])
    reactions = relationship(
        "MessageReaction", back_populates="message", cascade="all, delete-orphan"
    )
    attachments = relationship(
        "Attachment", back_populates="message", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_messages_conv_created", "conversation_id", "created_at"),
        Index("ix_messages_conv_id", "conversation_id", "id"),
        Index("ix_messages_sender", "sender_id"),
        Index("ix_messages_pinned_conv", "conversation_id", "is_pinned", "pinned_at"),
    )


class MessageReaction(Base):
    __tablename__ = "message_reactions"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(
        Integer,
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    emoji = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    message = relationship("Message", back_populates="reactions")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "message_id", "user_id", "emoji", name="uq_reaction_user_emoji"
        ),
        Index("ix_reaction_message", "message_id"),
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(
        Integer,
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    uploader_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    cloudinary_url = Column(String(500), nullable=True)  # Persistent Cloudinary URL
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    message = relationship("Message", back_populates="attachments")
    uploader = relationship("User")
