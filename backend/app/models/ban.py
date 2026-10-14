from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from app.database.connection import Base


class EmailBan(Base):
    """Blocked login identifiers: deleted/banned accounts can't come back.

    One row per lowercased email. Signup and every OAuth create-path refuse
    these addresses; login can never match them (the account row itself is
    deactivated or anonymized). Unbanning deletes the row — the address may
    register afresh.
    """

    __tablename__ = "email_bans"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    reason = Column(String(40), nullable=False, default="banned")
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
