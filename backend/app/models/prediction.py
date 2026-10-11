from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class Prediction(Base):
    """A group prediction: question + options, votes, creator-set result."""

    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    creator_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    question = Column(String(200), nullable=False)
    options = Column(Text, nullable=False, default="[]")  # JSON list of 2-4 strings
    closes_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default="open", nullable=False)  # open, resolved
    result_index = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("Conversation")
    votes = relationship(
        "PredictionVote", back_populates="prediction", cascade="all, delete-orphan"
    )


class PredictionVote(Base):
    __tablename__ = "prediction_votes"

    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(
        Integer,
        ForeignKey("predictions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    option_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    prediction = relationship("Prediction", back_populates="votes")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("prediction_id", "user_id", name="uq_prediction_voter"),
    )
