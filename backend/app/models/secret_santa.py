from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class SecretSantaDraw(Base):
    """A Secret Santa draw for a group (one unwrapped draw at a time).

    Assignments live as JSON pairs ``[[giver_id, receiver_id], ...]`` —
    deranged (nobody gifts themselves). Reveal posts every pair to the
    group; until then each giver sees only their own match.
    """

    __tablename__ = "secret_santa_draws"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    year = Column(Integer, nullable=False)
    status = Column(String(20), default="drawn", nullable=False)  # drawn, revealed
    assignments = Column(Text, nullable=False, default="[]")
    budget = Column(String(200), nullable=True)
    created_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("Conversation")
