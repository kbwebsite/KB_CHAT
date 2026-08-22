from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.sql import func
from app.database.connection import Base

class UserSettings(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    # Appearance
    theme = Column(String(20), default="system")  # light, dark, system
    accent_color = Column(String(20), default="violet")  # violet, blue, emerald, etc.
    chat_wallpaper = Column(String(50), default="default")
    # Notifications
    message_notifications = Column(Boolean, default=True)
    sound_enabled = Column(Boolean, default=True)
    desktop_notifications = Column(Boolean, default=False)
    # Privacy
    online_status_visible = Column(String(20), default="everyone")  # everyone, contacts, nobody
    read_receipts = Column(Boolean, default=True)
    last_seen_visible = Column(String(20), default="everyone")
    # Chat
    enter_to_send = Column(Boolean, default=True)
    media_auto_download = Column(Boolean, default=True)
    # Mute etc
    is_muted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
