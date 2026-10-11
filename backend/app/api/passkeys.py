"""Passkeys (WebAuthn): passwordless registration + sign-in.

Ceremonies (webauthn v3):
- Authenticated user: POST /register/options -> browser ->
  POST /register/verify. Manage via GET / and DELETE /{id}.
- Sign-in: POST /login/options {identifier?} -> browser ->
  POST /login/verify {identifier?, challenge_id, credential}.
  Without an identifier this is usernameless (discoverable
  credentials): the user is resolved from the credential id.

Challenges are single-use DB rows (5 min TTL) so any worker can
verify. RP ID/origin derive from the request Origin header with a
FRONTEND_URL fallback, so localhost dev and Render prod both work.
Verified logins issue the standard app session (same response shape
as password login, security-alert hook included).
"""

import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_

from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.passkey import PasskeyCredential, WebauthnChallenge
from app.schemas.common import success_response
from app.database.config import settings

router = APIRouter(prefix="/api/passkeys", tags=["passkeys"])

CHALLENGE_TTL_MINUTES = 5
MAX_CREDENTIALS = 10


def _rp_from_request(request: Request | None) -> tuple[str, str]:
    origin = ""
    try:
        origin = (
            (request.headers.get("origin") or "").strip().rstrip("/") if request else ""
        )
    except Exception:
        origin = ""
    if not origin:
        origin = (settings.FRONTEND_URL or "").strip().rstrip("/")
    host = urlparse(origin).hostname if origin else None
    if not host:
        host = "localhost"
        origin = origin or "http://localhost:5173"
    return host, origin


def _b64url(data: bytes) -> str:
    from webauthn.helpers import bytes_to_base64url

    return bytes_to_base64url(data)


def _issue_challenge(db: Session, user_id, purpose: str) -> tuple[str, bytes]:
    raw = secrets.token_bytes(32)
    now = datetime.now(timezone.utc)
    db.query(WebauthnChallenge).filter(WebauthnChallenge.expires_at <= now).delete()
    row = WebauthnChallenge(
        user_id=user_id,
        purpose=purpose,
        challenge=_b64url(raw),
        expires_at=now + timedelta(minutes=CHALLENGE_TTL_MINUTES),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return str(row.id), raw


def _consume_challenge(db: Session, challenge_id, user_id, purpose: str) -> bytes:
    try:
        cid = int(challenge_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="challenge_id required")
    now = datetime.now(timezone.utc)
    row = db.query(WebauthnChallenge).filter_by(id=cid, purpose=purpose).first()
    if not row or row.expires_at is None:
        raise HTTPException(
            status_code=400, detail="Challenge expired — restart sign-in"
        )
    exp = row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp <= now:
        db.delete(row)
        db.commit()
        raise HTTPException(
            status_code=400, detail="Challenge expired — restart sign-in"
        )
    if user_id is not None and row.user_id is not None and row.user_id != user_id:
        raise HTTPException(
            status_code=400, detail="Challenge mismatch — restart sign-in"
        )
    from webauthn.helpers import base64url_to_bytes

    raw = base64url_to_bytes(row.challenge)
    db.delete(row)
    db.commit()
    return raw


def _find_user(db: Session, identifier: str):
    ident = (identifier or "").lower().strip()
    if not ident:
        return None
    return (
        db.query(User).filter(or_(User.username == ident, User.email == ident)).first()
    )


def _cred_to_dict(c: PasskeyCredential):
    return {
        "id": c.id,
        "label": c.label,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
    }


def _transports_str(cred) -> str | None:
    try:
        t = getattr(getattr(cred, "response", None), "transports", None)
        if t:
            return ",".join(sorted({str(x) for x in t}))
    except Exception:
        pass
    return None


@router.get("")
def list_passkeys(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    rows = (
        db.query(PasskeyCredential)
        .filter_by(user_id=current_user.id)
        .order_by(desc(PasskeyCredential.id))
        .all()
    )
    return success_response([_cred_to_dict(c) for c in rows])


@router.delete("/{cred_id}")
def delete_passkey(
    cred_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = (
        db.query(PasskeyCredential)
        .filter_by(id=cred_id, user_id=current_user.id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Passkey not found")
    db.delete(c)
    db.commit()
    return success_response(None, "Passkey removed")


@router.post("/register/options")
def register_options(
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        import webauthn
        from webauthn.helpers.structs import (
            AuthenticatorSelectionCriteria,
            AuthenticatorAttachment,
            ResidentKeyRequirement,
            UserVerificationRequirement,
            PublicKeyCredentialDescriptor,
        )
    except ImportError:
        raise HTTPException(
            status_code=503, detail="Passkeys unavailable on this server"
        )
    existing = db.query(PasskeyCredential).filter_by(user_id=current_user.id).all()
    if len(existing) >= MAX_CREDENTIALS:
        raise HTTPException(
            status_code=400, detail="Too many passkeys — remove one first"
        )
    rp_id, _origin = _rp_from_request(request)
    challenge_id, raw = _issue_challenge(db, current_user.id, "reg")
    exclude = []
    for c in existing:
        try:
            from webauthn.helpers import base64url_to_bytes

            exclude.append(
                PublicKeyCredentialDescriptor(
                    id=base64url_to_bytes(c.credential_id), type="public-key"
                )
            )
        except Exception:
            continue
    options = webauthn.generate_registration_options(
        rp_id=rp_id,
        rp_name="Kryzen",
        user_id=str(current_user.id).encode(),
        user_name=current_user.username,
        user_display_name=current_user.display_name or current_user.username,
        challenge=raw,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.CROSS_PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        exclude_credentials=exclude or None,
    )
    return success_response(
        {
            "challenge_id": challenge_id,
            "options": json.loads(webauthn.options_to_json(options)),
        }
    )


@router.post("/register/verify")
def register_verify(
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        import webauthn
    except ImportError:
        raise HTTPException(
            status_code=503, detail="Passkeys unavailable on this server"
        )
    credential = payload.get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="credential required")
    rp_id, origin = _rp_from_request(request)
    expected = _consume_challenge(
        db, payload.get("challenge_id"), current_user.id, "reg"
    )
    try:
        verified = webauthn.verify_registration_response(
            credential=credential,
            expected_challenge=expected,
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=False,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registration rejected: {e}")
    cred_id = _b64url(verified.credential_id)
    if db.query(PasskeyCredential).filter_by(credential_id=cred_id).first():
        raise HTTPException(
            status_code=400, detail="This passkey is already registered"
        )
    label = (payload.get("label") or "").strip()[:100] or None
    if not label:
        try:
            ua = (request.headers.get("user-agent") or "")[:100] or None
        except Exception:
            ua = None
        label = ua
    db.add(
        PasskeyCredential(
            user_id=current_user.id,
            credential_id=cred_id,
            public_key=verified.credential_public_key,
            sign_count=verified.sign_count,
            transports=_transports_str(verified),
            label=label,
        )
    )
    db.commit()
    return success_response(None, "Passkey registered")


@router.post("/login/options")
def login_options(payload: dict, request: Request, db: Session = Depends(get_db)):
    try:
        import webauthn
        from webauthn.helpers.structs import PublicKeyCredentialDescriptor
    except ImportError:
        raise HTTPException(
            status_code=503, detail="Passkeys unavailable on this server"
        )
    user = _find_user(db, payload.get("identifier") or "")
    if payload.get("identifier") and not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user and not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    rp_id, _origin = _rp_from_request(request)
    challenge_id, raw = _issue_challenge(db, user.id if user else None, "auth")
    allow = None
    if user:
        allow = []
        for c in db.query(PasskeyCredential).filter_by(user_id=user.id).all():
            try:
                from webauthn.helpers import base64url_to_bytes

                allow.append(
                    PublicKeyCredentialDescriptor(
                        id=base64url_to_bytes(c.credential_id), type="public-key"
                    )
                )
            except Exception:
                continue
    options = webauthn.generate_authentication_options(
        rp_id=rp_id, challenge=raw, allow_credentials=allow or None
    )
    return success_response(
        {
            "challenge_id": challenge_id,
            "has_passkeys": bool(allow),
            "options": json.loads(webauthn.options_to_json(options)),
        }
    )


@router.post("/login/verify")
def login_verify(
    payload: dict,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    try:
        import webauthn
    except ImportError:
        raise HTTPException(
            status_code=503, detail="Passkeys unavailable on this server"
        )
    credential = payload.get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="credential required")
    user = _find_user(db, payload.get("identifier") or "")
    # Usernameless: resolve the account from the credential id.
    if not user:
        try:
            raw_id = credential.get("rawId") or credential.get("id") or ""
            user = (
                db.query(User)
                .join(PasskeyCredential, PasskeyCredential.user_id == User.id)
                .filter(PasskeyCredential.credential_id == raw_id)
                .first()
            )
        except Exception:
            user = None
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    rp_id, origin = _rp_from_request(request)
    expected = _consume_challenge(db, payload.get("challenge_id"), user.id, "auth")
    try:
        raw_id = credential.get("rawId") or credential.get("id") or ""
        stored = (
            db.query(PasskeyCredential)
            .filter_by(user_id=user.id, credential_id=raw_id)
            .first()
        )
    except Exception:
        stored = None
    if not stored:
        raise HTTPException(status_code=401, detail="Unknown passkey for this account")
    try:
        verified = webauthn.verify_authentication_response(
            credential=credential,
            expected_challenge=expected,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=stored.public_key,
            credential_current_sign_count=stored.sign_count,
            require_user_verification=False,
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Sign-in rejected: {e}")
    stored.sign_count = verified.new_sign_count
    stored.last_used_at = datetime.now(timezone.utc)
    db.commit()
    from app.api.auth import _session_response

    return _session_response(user, "Login successful", db, request, response)
