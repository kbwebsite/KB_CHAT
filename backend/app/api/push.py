from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.push_token import DeviceToken
from app.schemas.common import success_response

router = APIRouter(prefix="/api/push", tags=["push"])


class TokenRegister(BaseModel):
    token: str
    platform: str = "web"
    device_id: Optional[str] = None


@router.post("/tokens")
def register_token(
    payload: TokenRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.token or len(payload.token) > 500:
        raise HTTPException(status_code=400, detail="Invalid token")
    platform = (payload.platform or "web").lower()
    if platform not in ("web", "android", "ios"):
        platform = "web"
    existing = (
        db.query(DeviceToken)
        .filter_by(user_id=current_user.id, token=payload.token)
        .first()
    )
    if existing:
        existing.platform = platform
        existing.device_id = payload.device_id
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(
            DeviceToken(
                user_id=current_user.id,
                token=payload.token,
                platform=platform,
                device_id=payload.device_id,
            )
        )
    db.commit()
    return success_response({"registered": True}, "Push token registered")


@router.post("/tokens/unregister")
def unregister_token(
    payload: TokenRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(DeviceToken).filter_by(
        user_id=current_user.id, token=payload.token
    ).delete()
    db.commit()
    return success_response({"removed": True}, "Push token removed")


@router.get("/status")
def push_status():
    from app.utils.fcm import is_configured

    return success_response({"configured": is_configured()})
