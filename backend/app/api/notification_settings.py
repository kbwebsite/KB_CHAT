from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.notification_setting import NotificationSetting
from app.schemas.common import success_response

router = APIRouter(prefix="/api", tags=["notification-settings"])

@router.get("/notification-settings")
def get_notification_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings = db.query(NotificationSetting).filter_by(user_id=current_user.id).all()
    result = {}
    for s in settings:
        key = f"{s.setting_key}_{s.conversation_id or 'global'}"
        result[key] = {"setting_key": s.setting_key, "setting_value": s.setting_value, "conversation_id": s.conversation_id}
    return success_response(result)

@router.post("/notification-settings")
def update_notification_setting(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    key = payload.get("setting_key", "").strip()
    value = payload.get("setting_value", "all")
    conv_id = payload.get("conversation_id")
    if not key:
        raise HTTPException(status_code=400, detail="setting_key required")
    if value not in ("all", "mentions", "none"):
        raise HTTPException(status_code=400, detail="Invalid value")
    existing = db.query(NotificationSetting).filter_by(user_id=current_user.id, setting_key=key, conversation_id=conv_id).first()
    if existing:
        existing.setting_value = value
    else:
        db.add(NotificationSetting(user_id=current_user.id, setting_key=key, setting_value=value, conversation_id=conv_id))
    db.commit()
    return success_response({"setting_key": key, "setting_value": value, "conversation_id": conv_id}, "Updated")

@router.delete("/notification-settings/{setting_id}")
def delete_notification_setting(setting_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(NotificationSetting).filter_by(id=setting_id, user_id=current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(s)
    db.commit()
    return success_response(None, "Deleted")
