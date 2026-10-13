from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class Feedback(Base):
    """In-app feedback from Settings → Help and feedback.

    Categories: bug (something broke), idea (feature request), other.
    Status flow: new -> reviewed. Never deleted (audit + follow-up).
    """

    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category = Column(String(20), default="bug", nullable=False)  # bug, idea, other
    message = Column(Text, nullable=False)
    app_version = Column(String(50), nullable=True)
    status = Column(
        String(20), default="new", nullable=False, index=True
    )  # new, reviewed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


FEEDBACK_CATEGORIES = ("bug", "idea", "other")
