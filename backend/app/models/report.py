from sqlalchemy import Column, Integer, String, DateTime, Text, Index
from sqlalchemy.sql import func
from app.database.connection import Base


class Report(Base):
    """User-submitted moderation report (platform safety queue).

    Targets one entity (message / user / conversation); exactly one of
    message_id / reported_user_id / conversation_id is set. Status flow:
    open -> resolved (action recorded) — never deleted, for audit.
    """

    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, nullable=False, index=True)
    target_type = Column(String(20), nullable=False)  # message | user | conversation
    target_id = Column(Integer, nullable=False, index=True)
    reason = Column(String(40), nullable=False)
    details = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="open", index=True)
    action_taken = Column(String(40), nullable=True)
    resolved_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_reports_status_created", "status", "created_at"),)


REPORT_REASONS = (
    "spam",
    "harassment",
    "hate",
    "explicit",
    "scam",
    "violence",
    "other",
)

REPORT_ACTIONS = (
    "dismissed",
    "message_deleted",
    "user_deactivated",
)
