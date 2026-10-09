from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.settings import UserSettings
from app.schemas.common import success_response

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    accent_color: Optional[str] = None
    chat_wallpaper: Optional[str] = None
    message_notifications: Optional[bool] = None
    sound_enabled: Optional[bool] = None
    desktop_notifications: Optional[bool] = None
    is_muted: Optional[bool] = None
    notification_previews: Optional[bool] = None
    online_status_visible: Optional[str] = None
    read_receipts: Optional[bool] = None
    last_seen_visible: Optional[str] = None
    enter_to_send: Optional[bool] = None
    media_auto_download: Optional[bool] = None
    default_disappearing: Optional[int] = None
    silence_unknown_callers: Optional[bool] = None
    group_add_privacy: Optional[str] = None


def get_or_create_settings(db: Session, user_id: int):
    s = db.query(UserSettings).filter_by(user_id=user_id).first()
    if not s:
        s = UserSettings(user_id=user_id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("")
def get_settings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    s = get_or_create_settings(db, current_user.id)
    return success_response(
        {
            "theme": s.theme,
            "accent_color": s.accent_color,
            "chat_wallpaper": s.chat_wallpaper,
            "message_notifications": s.message_notifications,
            "sound_enabled": s.sound_enabled,
            "desktop_notifications": s.desktop_notifications,
            "is_muted": s.is_muted,
            "notification_previews": s.notification_previews,
            "online_status_visible": s.online_status_visible,
            "read_receipts": s.read_receipts,
            "last_seen_visible": s.last_seen_visible,
            "enter_to_send": s.enter_to_send,
            "media_auto_download": s.media_auto_download,
            "default_disappearing": s.default_disappearing,
            "silence_unknown_callers": bool(
                getattr(s, "silence_unknown_callers", False) or False
            ),
            "group_add_privacy": getattr(s, "group_add_privacy", "everyone")
            or "everyone",
        }
    )


@router.patch("")
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = get_or_create_settings(db, current_user.id)
    vals = payload.model_dump(exclude_unset=True)
    if "default_disappearing" in vals and vals["default_disappearing"] is not None:
        try:
            dd = int(vals["default_disappearing"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid timer value")
        if dd not in (86400, 604800, 7776000):
            raise HTTPException(
                status_code=400, detail="Timer must be 24 hours, 7 days or 90 days"
            )
        vals["default_disappearing"] = dd
    if "group_add_privacy" in vals and vals["group_add_privacy"] is not None:
        mode = str(vals["group_add_privacy"]).lower()
        if mode not in ("everyone", "contacts", "nobody"):
            raise HTTPException(
                status_code=400,
                detail="group_add_privacy must be everyone, contacts or nobody",
            )
        vals["group_add_privacy"] = mode
    for k, v in vals.items():
        # default_disappearing is nullable (Off = NULL); everything else
        # keeps the legacy skip-nulls behavior.
        if v is not None or k == "default_disappearing":
            setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return success_response(
        {
            "theme": s.theme,
            "accent_color": s.accent_color,
            "chat_wallpaper": s.chat_wallpaper,
            "message_notifications": s.message_notifications,
            "sound_enabled": s.sound_enabled,
            "desktop_notifications": s.desktop_notifications,
            "is_muted": s.is_muted,
            "notification_previews": s.notification_previews,
            "online_status_visible": s.online_status_visible,
            "read_receipts": s.read_receipts,
            "last_seen_visible": s.last_seen_visible,
            "enter_to_send": s.enter_to_send,
            "media_auto_download": s.media_auto_download,
            "default_disappearing": s.default_disappearing,
            "silence_unknown_callers": bool(
                getattr(s, "silence_unknown_callers", False) or False
            ),
            "group_add_privacy": getattr(s, "group_add_privacy", "everyone")
            or "everyone",
        },
        "Settings updated",
    )


@router.get("/sessions")
def get_sessions(current_user: User = Depends(get_current_user)):
    # For V1, single session - return current
    return success_response(
        [
            {
                "id": "current",
                "device": "Current Browser",
                "last_active": "now",
                "is_current": True,
            }
        ]
    )
