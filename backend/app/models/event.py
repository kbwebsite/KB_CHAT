from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base

class GroupEvent(Base):
    __tablename__ = "group_events"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    event_date = Column(DateTime(timezone=True), nullable=False)
    location = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("Conversation")
    creator = relationship("User")
    responses = relationship("EventResponse", back_populates="event", cascade="all, delete-orphan")

class EventResponse(Base):
    __tablename__ = "event_responses"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("group_events.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    response = Column(String(10), nullable=False)  # going, maybe, cant_go
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("GroupEvent", back_populates="responses")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_user_response"),
    )
