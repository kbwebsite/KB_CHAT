from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class GroupCallSession(Base):
    """A conversation-scoped group call room.

    Membership/roster is live over WS (``group_call.join/leave``); this row
    is the source of truth for "is there an active call" (ringing banners,
    late join) and for history. ``callee`` is intentionally absent: anyone
    in the conversation may join.
    """

    __tablename__ = "group_call_sessions"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    started_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    call_type = Column(String(20), default="voice")  # voice, video
    status = Column(String(20), default="ongoing")  # ongoing, ended
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)

    conversation = relationship("Conversation")
    starter = relationship("User")
