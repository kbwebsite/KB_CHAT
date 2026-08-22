from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from app.database.connection import Base

class CallHistory(Base):
    __tablename__ = "call_history"
    id = Column(Integer, primary_key=True, index=True)
    caller_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    callee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, index=True)
    call_type = Column(String(20), default="voice")  # voice, video
    status = Column(String(20), default="ended")  # missed, ended, rejected, ongoing
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, default=0)

    __table_args__ = (
        Index("ix_call_caller", "caller_id"),
        Index("ix_call_callee", "callee_id"),
    )
