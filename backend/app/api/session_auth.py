"""Session-auth API (Wave 2B-2).

Implements the Wave 2A contract for refresh / sessions inspection /
per-device revocation on top of ``services/auth_sessions.py``. Login-time
issuance lives in ``api/auth.py`` (shared helpers below); logout revocation
is applied there too because the route is already registered.

Refresh transport: ``kb_refresh`` cookie (HttpOnly, path-scoped). Native
body-token transport is OD-4 and stays provisional: when no cookie is sent,
a ``refresh_token`` body field is accepted (documented in WAVE2B2_REPORT).
"""

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.security import decode_token
from app.database.config import settings
from app.database.connection import get_db
from app.models.user import User
from app.services import auth_sessions as sessions
from app.services.errors import service_route

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "kb_refresh"
REFRESH_COOKIE_PATH = "/api/auth"


def cookie_secure() -> bool:
    # Production-only Secure would make local HTTP development impossible, so
    # the attribute follows APP_ENV explicitly (documented, tested both ways).
    return settings.APP_ENV == "production"


def set_refresh_cookie(response: Response, token: str) -> None:
    # Never logged: callers pass the plaintext only here and to the client.
    # Same-site only (Render-served SPA + local dev): Lax is strictly safer
    # than None (cookie never leaves our origins) and needs no Secure/HTTPS.
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=sessions.REFRESH_TTL_DAYS * 24 * 3600,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


def bearer_sid(request: Request) -> str | None:
    """Extract the ``sid`` claim from the request's Bearer token, if any."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        payload = decode_token(auth.split(" ", 1)[1].strip())
    except Exception:
        return None
    if not payload or not isinstance(payload, dict):
        return None
    sid = payload.get("sid")
    return sid if isinstance(sid, str) and sid else None


def client_ip(request: Request) -> str:
    # Same X-Forwarded-For convention as the rate-limit middleware in main.py.
    try:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            first = xff.split(",")[0].strip()
            if first:
                return first[:45]
    except Exception:
        pass
    try:
        return (request.client.host if request.client else "unknown")[:45]
    except Exception:
        return "unknown"


def device_info(request: Request) -> str | None:
    try:
        ua = request.headers.get("user-agent", "") or ""
    except Exception:
        return None
    ua = ua.strip()
    return ua[:200] if ua else None


def check_refresh_origin(request: Request) -> None:
    """CSRF mitigation for the cookie-backed refresh endpoint.

    Browsers always send Origin (or Referer) on cross-site POSTs; native
    clients and same-library callers send neither. So: when an origin signal
    is present it must allowlist-match, otherwise the request is allowed
    (native path). Cookie is only *read* here, never used for GETs.
    """
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin:
        return
    try:
        host = (urlparse(origin).hostname or "").lower()
    except Exception:
        raise HTTPException(status_code=403, detail="Forbidden origin")
    if not host:
        raise HTTPException(status_code=403, detail="Forbidden origin")
    allowed = set()
    for entry in settings.cors_origins_list:
        try:
            h = (urlparse(entry).hostname or "").lower()
        except Exception:
            continue
        if h:
            allowed.add(h)
    try:
        own = (request.url.hostname or "").lower()
    except Exception:
        own = ""
    if own:
        allowed.add(own)
    if host not in allowed:
        raise HTTPException(status_code=403, detail="Forbidden origin")


def maybe_issue_session(
    db: Session, user: User, request: Request | None, response: Response | None
) -> str | None:
    """Mint an auth session + short access token when the flag is on.

    Returns the ``sid``, or None in legacy mode. Cookie transport only in
    this wave (native body transport = OD-4, unresolved).
    """
    if not settings.SESSION_ISSUE_ENABLED:
        return None
    row, plaintext = sessions.create_session(
        db,
        user.id,
        device_info=device_info(request) if request is not None else None,
        ip_address=client_ip(request) if request is not None else None,
    )
    if response is not None:
        set_refresh_cookie(response, plaintext)
    return row.id


def user_public(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "about": user.about,
        "is_online": user.is_online,
        "email_verified": bool(getattr(user, "email_verified", False)),
        "last_seen": user.last_seen.isoformat() if user.last_seen else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _session_metadata(db: Session, user_id: int, current_sid: str | None) -> list:
    rows = (
        db.query(sessions.AuthSession)
        .filter_by(user_id=user_id)
        .filter(sessions.AuthSession.status == sessions.STATUS_ACTIVE)
        .order_by(sessions.AuthSession.last_used_at.desc())
        .all()
    )
    out = []
    for r in rows:
        # Safe metadata only: never refresh_hash, never tokens, never secrets.
        out.append(
            {
                "id": r.id,
                "device_info": r.device_info,
                "browser_info": r.browser_info,
                "ip_address": r.ip_address,
                "is_current": current_sid is not None and r.id == current_sid,
                "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            }
        )
    return out


@router.post("/refresh")
@service_route
async def refresh_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Rotate a refresh token; returns a new short access JWT.

    Web transport: ``kb_refresh`` cookie. Native/provisional: ``refresh_token``
    body field (OD-4). Cookie-present requests pass the Origin allowlist.
    """
    presented = request.cookies.get(REFRESH_COOKIE)
    if presented is not None:
        check_refresh_origin(request)
    else:
        # Provisional native path (OD-4): JSON body token, no cookies.
        try:
            body = await request.json()
        except Exception:
            body = {}
        if isinstance(body, dict):
            candidate = body.get("refresh_token") or ""
            presented = candidate.strip() if isinstance(candidate, str) else None
    if not presented:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    try:
        new_row, new_plaintext = sessions.refresh_session(db, presented)
    except SQLAlchemyError:
        # Store failure (missing/locked/unreachable DB): diagnosable 503,
        # never a 401 (would mask the outage) and never success. The token
        # itself is never logged.
        logger.exception("refresh failed: session store unavailable")
        raise HTTPException(
            status_code=503, detail="Authentication service temporarily unavailable"
        )
    except sessions.ServiceError as e:
        # Reuse kills the family: sweep every socket it ever held so a
        # thief's live connections die with it (per-message validation would
        # catch them within ~30s; this is immediate).
        if getattr(e, "detail", "") == "Refresh token reused":
            try:
                fam = sessions.find_family_by_refresh_hash(db, presented)
                if fam:
                    from app.websocket.manager import manager as _ws_manager

                    sids = sessions.get_sids_for_family(db, fam)

                    async def _sweep_family():
                        for _sid in sids:
                            try:
                                await _ws_manager.close_session_sockets(_sid)
                            except Exception:
                                pass

                    _ws_manager.spawn(_sweep_family())
            except Exception:
                pass
        raise
    try:
        user = db.query(User).filter_by(id=new_row.user_id).first()
    except SQLAlchemyError:
        logger.exception("refresh failed: user lookup unavailable")
        raise HTTPException(
            status_code=503, detail="Authentication service temporarily unavailable"
        )
    access = sessions.issue_access_token(user, new_row.id)
    set_refresh_cookie(response, new_plaintext)
    return {
        "success": True,
        "data": {
            "access_token": access,
            "token_type": "bearer",
            "expires_in": sessions.ACCESS_TOKEN_MINUTES * 60,
            "user": user_public(user),
        },
        "message": None,
    }


@router.get("/sessions")
def list_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Active refresh sessions for the caller (safe metadata only)."""
    if not settings.SESSION_ISSUE_ENABLED:
        return {"success": True, "data": [], "message": None}
    return {
        "success": True,
        "data": _session_metadata(db, current_user.id, bearer_sid(request)),
        "message": None,
    }


@router.delete("/sessions/{session_id}")
@service_route
def delete_session(
    session_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke one of the caller's own sessions. Unknown/other-user ids 404
    identically (no enumeration). The current session must use logout (400).
    Re-deleting an already-revoked own session is safe (200)."""
    if not settings.SESSION_ISSUE_ENABLED:
        raise HTTPException(status_code=404, detail="Session not found")
    if bearer_sid(request) == session_id:
        raise HTTPException(
            status_code=400, detail="Cannot delete current session; use logout"
        )
    row = sessions.get_session_by_sid(db, session_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    if row.status != sessions.STATUS_REVOKED:
        sessions.revoke_session(db, session_id, reason="user-revoke")
        from app.websocket.manager import manager as _ws_manager

        _ws_manager.spawn(_ws_manager.close_session_sockets(session_id))
    return {"success": True, "data": None, "message": "Session revoked"}
