from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class SecurityAlert(Base):
    """Security events worth surfacing: new-device sign-ins.

    ``device`` is the truncated User-Agent that first appeared for the
    user; ``seen_at`` clears the badge in settings. Never blocks login.
    """

    __tablename__ = "security_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event = Column(String(30), default="new_login", nullable=False)
    ip = Column(String(45), nullable=True)
    device = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    seen_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
