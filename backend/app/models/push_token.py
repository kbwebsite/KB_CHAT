from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class DeviceToken(Base):
    """FCM registration token for one user device (web or Android).

    Tokens change on reinstall/refresh — register is an upsert keyed by
    (user_id, token). Stale tokens are pruned when FCM reports them gone.
    """

    __tablename__ = "device_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token = Column(String(500), nullable=False)
    platform = Column(String(20), nullable=False, default="web")  # web, android, ios
    device_id = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", "token", name="uq_device_user_token"),
        Index("ix_device_token_user", "user_id"),
    )
