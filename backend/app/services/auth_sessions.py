"""Persistent refresh-session primitives (Wave 2B-1, hybrid auth foundation).

Implements the session lifecycle from WAVE2_AUTH_DESIGN sections 4-7 at the
service level. No route, frontend, or WebSocket code calls this yet (later
Wave 2 phases wire issue/refresh/logout). Fail-closed throughout: every
ambiguous case denies.

One deliberate deviation from the design text, chosen as the smallest
compatible interpretation (full note in WAVE2B1_REPORT): the design's
"in-grace reuse re-issues the SAME pair" is impossible without storing
refresh plaintext (which the design forbids). In-grace reuse therefore
rotates AGAIN from the used row and marks the intermediate successor
``superseded``; retries converge, the single-valid-token invariant holds.

Provisional values (OD-1, pending approval — see WAVE2B1_REPORT):
``REFRESH_TTL_DAYS=30``, ``REUSE_GRACE_SECONDS=30``,
``ACCESS_TOKEN_MINUTES=15``, ``PURGE_RETENTION_DAYS=90``.
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import create_access_token
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.errors import ServiceError, bad_request, not_found

# --- provisional defaults (OD-1) -------------------------------------------
REFRESH_TTL_DAYS = 30
REUSE_GRACE_SECONDS = 30
ACCESS_TOKEN_MINUTES = 15
PURGE_RETENTION_DAYS = 90

STATUS_ACTIVE = "active"
STATUS_USED = "used"
STATUS_REVOKED = "revoked"


def _now(now: datetime | None) -> datetime:
    return now if now is not None else datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; interpret them as UTC (same convention
    # as the auth code-step helpers).
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _unauthorized(detail: str) -> ServiceError:
    return ServiceError(401, detail)


def generate_refresh_token() -> str:
    """256-bit opaque random token. Never a JWT, never logged, never stored."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """SHA-256 hex digest: the only form that ever touches the database."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(
    db: Session,
    user_id: int,
    *,
    device_info=None,
    browser_info=None,
    ip_address=None,
    ttl_days: int = REFRESH_TTL_DAYS,
    now: datetime | None = None,
) -> tuple:
    """Open a new family (one per device/login). Returns ``(row, plaintext)``.

    The plaintext is returned exactly once for transport (cookie/body by the
    later API phase); only its hash is persisted.
    """
    ts = _now(now)
    token = generate_refresh_token()
    row = AuthSession(
        id=str(uuid.uuid4()),
        user_id=user_id,
        family_id=str(uuid.uuid4()),
        refresh_hash=hash_refresh_token(token),
        status=STATUS_ACTIVE,
        device_info=device_info,
        browser_info=browser_info,
        ip_address=ip_address,
        created_at=ts,
        last_used_at=ts,
        expires_at=ts + timedelta(days=ttl_days),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, token


def get_session_by_sid(db: Session, sid: str) -> AuthSession | None:
    return db.query(AuthSession).filter_by(id=sid).first()


def is_access_session_valid(
    db: Session, sid: str, user_id: int, now: datetime | None = None
) -> str | None:
    """Access-path session check for ``get_current_user`` / WS connect.

    Returns None when the session authorizes API use, else a failure reason.
    Unlike ``is_session_active`` (strict: refresh path), a ``used`` row still
    authorizes: normal rotation must NOT kill in-flight access tokens issued
    before the rotation. Revocation (logout / family kill / user revoke) and
    expiry always deny, as does a ``sid`` owned by another user.
    """
    row = get_session_by_sid(db, sid)
    if row is None:
        return "revoked"
    if row.user_id != user_id:
        return "owner-mismatch"
    if row.status == STATUS_REVOKED:
        return "revoked"
    if _aware(row.expires_at) <= _now(now):
        return "expired"
    return None


def is_session_active(db: Session, sid: str, now: datetime | None = None) -> bool:
    """Strict liveness (refresh path): only an ``active``, unexpired row."""
    row = get_session_by_sid(db, sid)
    if row is None or row.status != STATUS_ACTIVE:
        return False
    return _aware(row.expires_at) > _now(now)


def _get_user_or_deny(db: Session, user_id: int) -> User:
    user = db.query(User).filter_by(id=user_id).first()
    if user is None or not user.is_active:
        raise _unauthorized("Account inactive")
    return user


def _revoke_row(db: Session, row: AuthSession, *, reason: str, now: datetime) -> None:
    if row.status != STATUS_REVOKED:
        row.status = STATUS_REVOKED
        row.revoked_at = now
        row.revoke_reason = reason


def _issue_successor(
    db: Session,
    predecessor: AuthSession,
    *,
    presented_hash: str,
    now: datetime,
    ttl_days: int = REFRESH_TTL_DAYS,
) -> tuple:
    """Mark ``predecessor`` used and open its successor. Returns new pair."""
    token = generate_refresh_token()
    successor = AuthSession(
        id=str(uuid.uuid4()),
        user_id=predecessor.user_id,
        family_id=predecessor.family_id,
        refresh_hash=hash_refresh_token(token),
        status=STATUS_ACTIVE,
        rotated_from_hash=presented_hash,
        device_info=predecessor.device_info,
        browser_info=predecessor.browser_info,
        ip_address=predecessor.ip_address,
        created_at=now,
        last_used_at=now,
        expires_at=now + timedelta(days=ttl_days),
    )
    predecessor.status = STATUS_USED
    # First rotation stamps used_at; in-grace rotations keep the ORIGINAL
    # stamp so the grace window cannot be extended by replaying (fail-closed).
    if predecessor.used_at is None:
        predecessor.used_at = now
    predecessor.last_used_at = now
    db.add(successor)
    try:
        db.commit()
    except IntegrityError:
        # Lost a concurrent rotation race: caller retries with its own result.
        db.rollback()
        raise _unauthorized("Concurrent refresh, retry")
    db.refresh(successor)
    return successor, token


def refresh_session(
    db: Session,
    presented_token: str,
    *,
    now: datetime | None = None,
    ttl_days: int = REFRESH_TTL_DAYS,
    grace_seconds: int = REUSE_GRACE_SECONDS,
) -> tuple:
    """Rotate a refresh token. Returns ``(new_row, new_plaintext)``.

    Fail-closed outcomes (all ``ServiceError(401)``):
    unknown hash → invalid (no side effects, family unidentifiable);
    expired → expired; revoked → revoked; used past grace → **family revoked**.
    """
    ts = _now(now)
    if not presented_token:
        raise _unauthorized("Invalid refresh token")
    presented_hash = hash_refresh_token(presented_token)
    row = db.query(AuthSession).filter_by(refresh_hash=presented_hash).first()
    if row is None:
        raise _unauthorized("Invalid refresh token")
    if _aware(row.expires_at) <= ts:
        raise _unauthorized("Refresh token expired")
    if row.status == STATUS_REVOKED:
        raise _unauthorized("Session revoked")

    if row.status == STATUS_USED:
        age = (ts - _aware(row.used_at or row.last_used_at)).total_seconds()
        if age > grace_seconds:
            # Theft signal: a used token resurfacing late means the rotation
            # chain was forked. Kill the family, loudly.
            revoke_family(db, row.family_id, reason="reuse", now=ts)
            raise _unauthorized("Refresh token reused")
        # In-grace retry (multi-tab / double submit): rotate again from the
        # used row and supersede the intermediate successor so exactly one
        # token stays valid. Retries converge.
        successor = (
            db.query(AuthSession)
            .filter_by(rotated_from_hash=presented_hash, status=STATUS_ACTIVE)
            .first()
        )
        if successor is not None:
            _revoke_row(db, successor, reason="superseded", now=ts)
        _get_user_or_deny(db, row.user_id)
        return _issue_successor(db, row, presented_hash=presented_hash, now=ts)

    _get_user_or_deny(db, row.user_id)
    return _issue_successor(
        db, row, presented_hash=presented_hash, now=ts, ttl_days=ttl_days
    )


def find_family_by_refresh_hash(db: Session, token: str) -> str | None:
    """Family of a presented token (even a dead one) — sweep use only."""
    if not token:
        return None
    row = (
        db.query(AuthSession).filter_by(refresh_hash=hash_refresh_token(token)).first()
    )
    return row.family_id if row is not None else None


def get_sids_for_family(db: Session, family_id: str) -> list:
    """All session ids in a family (live or dead) for socket sweeps."""
    return [r[0] for r in db.query(AuthSession.id).filter_by(family_id=family_id).all()]


def revoke_session(
    db: Session, sid: str, *, reason: str = "logout", now: datetime | None = None
) -> AuthSession:
    """Revoke one session (logout / per-device logout). Idempotent."""
    row = get_session_by_sid(db, sid)
    if row is None:
        raise not_found("Session not found")
    _revoke_row(db, row, reason=reason, now=_now(now))
    db.commit()
    return row


def revoke_family(
    db: Session, family_id: str, *, reason: str, now: datetime | None = None
) -> int:
    """Revoke every live row in a family (reuse signal). Returns count."""
    ts = _now(now)
    rows = (
        db.query(AuthSession)
        .filter_by(family_id=family_id)
        .filter(AuthSession.status != STATUS_REVOKED)
        .all()
    )
    for row in rows:
        _revoke_row(db, row, reason=reason, now=ts)
    db.commit()
    return len(rows)


def revoke_user_sessions(
    db: Session,
    user_id: int,
    *,
    except_sid: str | None = None,
    reason: str,
    now: datetime | None = None,
) -> int:
    """Revoke a user's sessions, optionally keeping one (password-change /
    reset primitives for later phases; no callers yet). Returns count."""
    if not reason:
        raise bad_request("Revocation reason required")
    ts = _now(now)
    q = (
        db.query(AuthSession)
        .filter_by(user_id=user_id)
        .filter(AuthSession.status != STATUS_REVOKED)
    )
    if except_sid is not None:
        q = q.filter(AuthSession.id != except_sid)
    rows = q.all()
    for row in rows:
        _revoke_row(db, row, reason=reason, now=ts)
    db.commit()
    return len(rows)


def purge_sessions(
    db: Session,
    *,
    retention_days: int = PURGE_RETENTION_DAYS,
    now: datetime | None = None,
) -> int:
    """Delete non-active rows whose expiry is older than the retention window.
    Active sessions are never purged (lazy expiry on access instead)."""
    ts = _now(now)
    cutoff = ts - timedelta(days=retention_days)
    rows = (
        db.query(AuthSession)
        .filter(AuthSession.status != STATUS_ACTIVE)
        .filter(AuthSession.expires_at < cutoff)
        .all()
    )
    for row in rows:
        db.delete(row)
    db.commit()
    return len(rows)


def issue_access_token(
    user: User, sid: str, *, minutes: int = ACCESS_TOKEN_MINUTES
) -> str:
    """Mint a short-lived access JWT bound to a session.

    Uses the existing ``create_access_token`` mechanism plus ``sid``/``jti``.
    ``iss``/``aud`` enforcement lands in a later phase (legacy tokens lack
    them, so validating now would break compat). Not wired into login yet.
    """
    from datetime import timedelta as _td

    return create_access_token(
        {
            "sub": str(user.id),
            "username": user.username,
            "sid": sid,
            "jti": str(uuid.uuid4()),
        },
        expires_delta=_td(minutes=minutes),
    )
