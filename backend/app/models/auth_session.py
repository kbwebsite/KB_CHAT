from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base


class AuthSession(Base):
    """Server-side refresh session (Wave 2B-1, hybrid auth foundation).

    One row per device rotation step. ``family_id`` groups a device's
    rotation chain; ``refresh_hash`` is the SHA-256 of the opaque refresh
    token (the plaintext is never stored). See
    .mece/cells/BACKEND/WAVE2_AUTH_DESIGN.md section 7 for the per-field
    rationale. Nothing reads this table yet (later Wave 2 phases).
    """

    __tablename__ = "auth_sessions"

    # sid: stable session id, also the JWT ``sid`` claim (later phases).
    id = Column(String(36), primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Rotation chain id: reuse outside grace revokes the whole family.
    family_id = Column(String(36), nullable=False, index=True)
    # SHA-256 hex of the opaque refresh token. UNIQUE so concurrent rotations
    # cannot issue the same row twice (first writer wins).
    refresh_hash = Column(String(64), nullable=False, unique=True, index=True)
    # active | used (rotated) | revoked. Plain string, like member roles.
    status = Column(String(16), nullable=False, default="active", index=True)
    # Previous token's hash: grace math + forensics. NULL on first issue.
    rotated_from_hash = Column(String(64), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    # logout | reuse | superseded | password-change | password-reset | admin
    revoke_reason = Column(String(32), nullable=True)
    device_info = Column(String(200), nullable=True)
    browser_info = Column(String(200), nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_used_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at = Column(DateTime(timezone=True), nullable=False)

    user = relationship("User")

    __table_args__ = (Index("ix_auth_sessions_status_expires", "status", "expires_at"),)
