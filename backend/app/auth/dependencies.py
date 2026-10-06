from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.auth.security import decode_token
from app.models.user import User

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    user_id = payload.get("sub")
    # sub is string
    try:
        uid = int(user_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload"
        )
    user = db.query(User).filter(User.id == uid).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    # Wave 2 Phase 1: sid-bound tokens additionally require a live session.
    # Legacy tokens (no sid) keep the exact old behavior. Rotation marks the
    # predecessor row `used`, which still authorizes in-flight access tokens;
    # only revoked/expired/foreign sessions deny.
    sid = payload.get("sid")
    if isinstance(sid, str) and sid:
        from app.services import auth_sessions as sessions

        reason = sessions.is_access_session_valid(db, sid, user.id)
        if reason == "expired":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
            )
        if reason is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked"
            )
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    if not payload:
        return None
    try:
        uid = int(payload.get("sub"))
    except:
        return None
    return db.query(User).filter(User.id == uid).first()
