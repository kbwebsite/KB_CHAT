from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database.connection import Base


class Channel(Base):
    """WhatsApp-style channel: one-way broadcast feed.

    The owner posts updates; anyone authenticated can discover and follow
    the channel, followers read posts. No replies — like announcements.
    """

    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChannelFollow(Base):
    """A user's follow on a channel (many-to-many)."""

    __tablename__ = "channel_follows"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(
        Integer,
        ForeignKey("channels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("channel_id", "user_id", name="uq_channel_follow"),
    )


class ChannelPost(Base):
    """A single owner update posted into a channel feed."""

    __tablename__ = "channel_posts"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(
        Integer,
        ForeignKey("channels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    message_type = Column(String(20), nullable=False, default="text")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
