from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func

from app.database.connection import Base


class BroadcastList(Base):
    """WhatsApp-style broadcast list: one sender, many recipients.

    Sending fans out as individual 1-1 messages (no shared group).
    member_ids is a JSON list of user ids; works on SQLite + Postgres.
    """

    __tablename__ = "broadcast_lists"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    member_ids = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
