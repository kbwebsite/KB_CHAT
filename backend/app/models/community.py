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


class Community(Base):
    """WhatsApp-style community: an umbrella over groups with an
    announcement channel that reaches every linked group."""

    __tablename__ = "communities"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CommunityGroup(Base):
    """Links a group conversation into a community (many-to-many)."""

    __tablename__ = "community_groups"

    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(
        Integer,
        ForeignKey("communities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    conversation_id = Column(
        Integer,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("community_id", "conversation_id", name="uq_community_group"),
    )
