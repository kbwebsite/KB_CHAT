from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime, timedelta, timezone
from app.database.connection import get_db
from app.schemas.user import UserCreate, UserLogin, UserPrivate
from app.schemas.common import success_response, error_response
from app.models.user import User
from app.auth.security import hash_password, verify_password, create_access_token
from app.auth.dependencies import get_current_user
from app.database.config import settings
import traceback
import httpx
import re
import secrets
import hashlib

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup")
def signup(payload: UserCreate, db: Session = Depends(get_db)):
    try:
        username = (payload.username or "").lower().strip()
        if not username:
            # Email-only signup: derive a unique handle from the address.
            username = _unique_username(db, payload.email.split("@")[0])
        existing = (
            db.query(User)
            .filter(
                or_(
                    User.username == username,
                    User.email == payload.email.lower(),
                )
            )
            .first()
        )
        if existing:
            if existing.username == username:
                raise HTTPException(status_code=400, detail="Username already taken")
            else:
                raise HTTPException(status_code=400, detail="Email already registered")
        hashed = hash_password(payload.password)
        user = User(
            username=username,
            email=payload.email.lower(),
            display_name=payload.display_name,
            hashed_password=hashed,
            about="Hey there! I'm using KB Chat.",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # Native-signup email verification (Resend 6-digit code). Fail-soft:
        # signup still succeeds when the sender isn't configured.
        verification_sent = False
        if user.auth_provider in (None, "local"):
            try:
                verification_sent = bool(_issue_code(db, user))
            except HTTPException:
                verification_sent = False
            except Exception as e:
                print(f"[auth] verification email failed: {e}")
        token = create_access_token({"sub": str(user.id), "username": user.username})
        return success_response(
            {
                "access_token": token,
                "token_type": "bearer",
                "verification_sent": verification_sent,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "display_name": user.display_name,
                    "avatar_url": user.avatar_url,
                    "about": user.about,
                    "is_online": user.is_online,
                    "email_verified": bool(getattr(user, "email_verified", False)),
                    "last_seen": user.last_seen.isoformat() if user.last_seen else None,
                    "created_at": user.created_at.isoformat()
                    if user.created_at
                    else None,
                },
            },
            "Account created successfully"
            + (
                " — check your inbox for the verification code"
                if verification_sent
                else ""
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"SIGNUP ERROR: {e}\n{tb}")
        return error_response(None, f"Signup failed: {str(e)}")


@router.post("/login")
def login(payload: UserLogin, db: Session = Depends(get_db)):
    try:
        ident = payload.identifier.lower().strip()
        user = (
            db.query(User)
            .filter(or_(User.username == ident, User.email == ident))
            .first()
        )
        if not user or not verify_password(payload.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if user.auth_provider == "google":
            raise HTTPException(
                status_code=400,
                detail="This account uses Google Sign-In. Please use Google to login.",
            )
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account disabled")
        # Every password sign-in requires a fresh inbox code: correct
        # password alone never yields a token. The code step also marks
        # the inbox verified, so first-time and returning users share it.
        code_sent = False
        try:
            code_sent = bool(_issue_code(db, user))
        except HTTPException as e:
            if e.status_code == 429:
                # A code went out <60s ago (e.g. right after signup) —
                # don't error, just point at the inbox.
                code_sent = True
            else:
                raise
        if not code_sent:
            # No mail backend configured (dev/test): fail-open with a
            # direct token, mirroring the fail-soft signup behavior.
            print("[auth] no mail backend — issuing login token without code step")
            return _login_token_response(user)
        return success_response(
            {
                "login_step": "verify_code",
                "email": user.email,
                "code_sent": True,
            },
            "Verification code sent — enter it to finish signing in",
        )
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"LOGIN ERROR: {e}\n{tb}")
        return error_response(None, f"Login failed: {str(e)}")


def _login_token_response(user: User):
    """Full session payload shared by login fallbacks and code verify."""
    token = create_access_token({"sub": str(user.id), "username": user.username})
    return success_response(
        {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "about": user.about,
                "is_online": user.is_online,
                "email_verified": bool(getattr(user, "email_verified", False)),
                "last_seen": user.last_seen.isoformat() if user.last_seen else None,
                "created_at": user.created_at.isoformat()
                if user.created_at
                else None,
            },
        },
        "Login successful",
    )


@router.post("/verify-login")
def verify_login(payload: dict, db: Session = Depends(get_db)):
    """Second step of password sign-in: redeem the fresh inbox code."""
    try:
        email = (payload.get("email", "") or "").lower().strip()
        code = (payload.get("code", "") or "").strip()
        if not email or len(code) != 6 or not code.isdigit():
            raise HTTPException(status_code=400, detail="Invalid or expired code")
        user = db.query(User).filter_by(email=email).first()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid or expired code")
        if (user.auth_provider or "local") != "local":
            raise HTTPException(status_code=400, detail="Invalid or expired code")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account disabled")
        uid = _consume_code(db, email, code)
        if uid is None or uid != user.id:
            raise HTTPException(status_code=400, detail="Invalid or expired code")
        # A redeemed login code proves inbox ownership.
        user.email_verified = True
        db.commit()
        return _login_token_response(user)
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"VERIFY LOGIN ERROR: {e}\n{tb}")
        return error_response(None, "Failed to verify code")


@router.post("/logout")
def logout(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    current_user.is_online = False
    current_user.last_seen = datetime.now(timezone.utc)
    db.commit()
    return success_response(None, "Logged out successfully")


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return success_response(
        {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "display_name": current_user.display_name,
            "avatar_url": current_user.avatar_url,
            "about": current_user.about,
            "is_online": current_user.is_online,
            "last_seen": current_user.last_seen.isoformat()
            if current_user.last_seen
            else None,
            "created_at": current_user.created_at.isoformat()
            if current_user.created_at
            else None,
        }
    )


def _unique_username(db: Session, base: str) -> str:
    base = re.sub(r"[^a-z0-9_-]", "", (base or "").lower()) or "user"
    if len(base) < 3:
        base = base + "user"
    username, counter = base, 1
    while db.query(User).filter_by(username=username).first():
        username = f"{base}{counter}"
        counter += 1
    return username


def _get_or_create_oauth_user(
    db: Session, *, email: str, name=None, picture=None, provider: str, about: str
):
    """Shared find-or-create for OAuth/Firebase logins keyed by email.

    Never duplicates by email and never overwrites an existing user's
    identity fields (only backfills blanks).
    """
    user = db.query(User).filter_by(email=email.lower()).first()
    if user:
        if not user.avatar_url and picture:
            user.avatar_url = picture
        if user.display_name == "Hey there! I'm using KB Chat." and name:
            user.display_name = name
        # OAuth emails arrive pre-verified by the provider — record it so
        # the account never falls into the native verification gate.
        if not bool(getattr(user, "email_verified", False)):
            user.email_verified = True
        db.commit()
        db.refresh(user)
        return user
    username = _unique_username(db, email.split("@")[0])
    user = User(
        username=username,
        email=email.lower(),
        display_name=name or username,
        hashed_password=hash_password(f"{provider}-oauth-no-password"),
        avatar_url=picture,
        about=about,
        auth_provider=provider,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _get_or_create_phone_user(db: Session, *, fb_uid: str, phone=None, name=None):
    """Phone-auth users have no email; the Firebase uid is the stable key."""
    email = f"phone-{fb_uid}@phone.local".lower()
    user = db.query(User).filter_by(email=email).first()
    if user:
        return user
    digits = re.sub(r"\D", "", phone or "")
    username = _unique_username(
        db, digits[-10:] if len(digits) >= 4 else f"user{fb_uid[:8]}"
    )
    user = User(
        username=username,
        email=email,
        display_name=name or (f"User {digits[-4:]}" if digits else username),
        hashed_password=hash_password("firebase-phone-no-password"),
        avatar_url=None,
        about="Signed in with phone",
        auth_provider="firebase",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _session_response(user, message: str):
    token = create_access_token({"sub": str(user.id), "username": user.username})
    return success_response(
        {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "about": user.about,
                "is_online": user.is_online,
                "last_seen": user.last_seen.isoformat() if user.last_seen else None,
                "created_at": user.created_at.isoformat() if user.created_at else None,
            },
        },
        message,
    )


_firebase_app = None


def _firebase_app_or_503():
    """Lazy Admin SDK init; 503 (not 500) when the server has no credentials."""
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app
    try:
        from app.database.config import settings

        raw = (settings.FIREBASE_CREDENTIALS_JSON or "").strip()
        if not raw:
            raise ValueError("missing credentials")
        import json as _json
        from firebase_admin import credentials, initialize_app, get_app

        try:
            _firebase_app = initialize_app(credentials.Certificate(_json.loads(raw)))
        except ValueError:
            # Already initialized (tests, reloaders) — reuse it.
            _firebase_app = get_app()
        return _firebase_app
    except HTTPException:
        raise
    except Exception as e:
        print(f"[auth] firebase admin init failed: {e}")
        raise HTTPException(
            status_code=503, detail="Firebase login is not configured on the server"
        )


@router.post("/firebase")
def firebase_auth(payload: dict, db: Session = Depends(get_db)):
    """Exchange a Firebase ID token (email/Google/phone) for an app session.

    Identity comes ONLY from the verified token — never from client fields.
    """
    id_token = (payload.get("id_token") or "").strip()
    if not id_token:
        raise HTTPException(status_code=400, detail="id_token required")
    _firebase_app_or_503()
    try:
        from firebase_admin import auth as fb_auth

        decoded = fb_auth.verify_id_token(id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")
    provider = (decoded.get("firebase") or {}).get("sign_in_provider", "")
    email = (decoded.get("email") or "").lower() or None
    # Email/password accounts can claim any address until verified — refuse
    # unverified ones so nobody can squat someone else's email. Same for
    # any other email-based provider (e.g. Google): only verified inboxes
    # get sessions. (Phone logins carry no email and are unaffected.)
    if email and not decoded.get("email_verified"):
        raise HTTPException(
            status_code=401, detail="Please verify your email address first"
        )
    name = decoded.get("name")
    picture = decoded.get("picture")
    phone = decoded.get("phone_number")
    if email:
        user = _get_or_create_oauth_user(
            db,
            email=email,
            name=name,
            picture=picture,
            provider="firebase",
            about="Signed in with Firebase",
        )
    elif phone:
        user = _get_or_create_phone_user(
            db, fb_uid=decoded.get("uid", ""), phone=phone, name=name
        )
    else:
        raise HTTPException(status_code=400, detail="Token has neither email nor phone")
    return _session_response(user, "Login successful")


@router.post("/google")
def google_auth(payload: dict, db: Session = Depends(get_db)):
    """Authenticate with Google. Accepts a Google ID token or credential.
    Verifies with Google's tokeninfo endpoint, finds or creates user."""
    try:
        credential = payload.get("credential") or payload.get("id_token")
        if not credential:
            raise HTTPException(status_code=400, detail="Google credential required")

        # Verify token with Google
        google_client_id = (settings.GOOGLE_CLIENT_ID or "").strip()
        if not google_client_id:
            raise HTTPException(status_code=500, detail="Google Sign-In not configured")

        # Call Google's tokeninfo endpoint to verify
        try:
            resp = httpx.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}",
                timeout=10,
            )
        except Exception:
            raise HTTPException(
                status_code=502, detail="Could not reach Google to verify token"
            )
        if resp.status_code != 200:
            # Surface Google's reason (e.g. invalid_token, expired) so the
            # login screen can show something actionable.
            try:
                reason = resp.json().get("error_description") or resp.json().get(
                    "error"
                )
            except Exception:
                reason = None
            raise HTTPException(
                status_code=401,
                detail=f"Google rejected the token{': ' + reason if reason else ''}",
            )

        google_data = resp.json()
        google_email = google_data.get("email")
        google_name = google_data.get("name", "")
        google_picture = google_data.get("picture")
        google_sub = google_data.get("sub")

        if not google_email:
            raise HTTPException(status_code=401, detail="No email in Google token")

        # Google tells us whether the inbox is verified — unverified ones
        # get no session, same rule as every other email path.
        if not google_data.get("email_verified"):
            raise HTTPException(
                status_code=401, detail="Please verify your email address first"
            )

        # Verify the token was issued for our client ID
        aud = (google_data.get("aud") or "").strip()
        if aud != google_client_id:
            raise HTTPException(
                status_code=401,
                detail="Token was not issued for this app (client ID mismatch). "
                "Check GOOGLE_CLIENT_ID on the server and the authorized origins in Google Cloud Console.",
            )

        # Find existing user by email (shared helper — same behavior as before)
        user = _get_or_create_oauth_user(
            db,
            email=google_email,
            name=google_name,
            picture=google_picture,
            provider="google",
            about="Signed in with Google",
        )
        return _session_response(user, "Google login successful")
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"GOOGLE AUTH ERROR: {e}\n{tb}")
        return error_response(None, f"Google auth failed: {str(e)}")


@router.post("/forgot-password")
def forgot_password(payload: dict, db: Session = Depends(get_db)):
    """Request a password reset. Dev returns the reset token; production does
    not (no email sender is wired up yet, so disclosing it would allow
    account takeover with no inbox proof)."""
    try:
        email = payload.get("email", "").lower().strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email required")

        user = db.query(User).filter_by(email=email).first()
        if not user:
            # Don't reveal if email exists
            return success_response(
                None, "If the email exists, a reset link has been sent"
            )

        # Generate reset token (hash of random string + timestamp)
        reset_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(reset_token.encode()).hexdigest()

        # Store token hash and expiry in user (or separate table)
        # For simplicity, store in a temporary field or use a dict
        # Here we'll use a simple in-memory approach (production should use Redis/DB)
        if not hasattr(settings, "_reset_tokens"):
            settings._reset_tokens = {}
        settings._reset_tokens[token_hash] = {
            "user_id": user.id,
            "expires": datetime.now(timezone.utc) + timedelta(hours=1),
        }

        # SECURITY: the live token must NEVER go back in the response once an
        # email sender exists — returning it lets anyone who knows (or
        # guesses) an email take over that account with zero proof of inbox
        # access. With Resend configured the link goes to the inbox; without
        # it, dev keeps the token in the response for local testing (the
        # frontend already handles a missing token by showing the generic
        # "Email Sent" screen).
        from app.utils.email import email_configured, send_password_reset

        if email_configured():
            link = f"{settings.FRONTEND_URL.rstrip('/')}/forgot-password?token={reset_token}"
            try:
                send_password_reset(email, link)
            except Exception as e:
                print(f"[auth] reset email failed: {e}")
            return success_response(
                None, "If the email exists, a reset link has been sent"
            )

        if settings.APP_ENV == "production":
            return success_response(
                None, "If the email exists, a reset link has been sent"
            )

        # Dev mode only: return it in response (no email sender configured).
        print(f"[AUTH] Password reset token for {email}: {reset_token}")

        return success_response(
            {
                "token": reset_token,
                "message": "Reset token generated (check console in dev mode)",
            },
            "If the email exists, a reset link has been sent",
        )
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"FORGOT PASSWORD ERROR: {e}\n{tb}")
        return error_response(None, "Failed to process password reset")


@router.post("/reset-password")
def reset_password(payload: dict, db: Session = Depends(get_db)):
    """Reset password using the token from forgot-password."""
    try:
        token = payload.get("token", "")
        new_password = payload.get("new_password", "")

        if not token or not new_password:
            raise HTTPException(
                status_code=400, detail="Token and new password required"
            )

        if len(new_password) < 6:
            raise HTTPException(
                status_code=400, detail="Password must be at least 6 characters"
            )

        # Verify token
        if not hasattr(settings, "_reset_tokens"):
            raise HTTPException(status_code=400, detail="Invalid or expired token")

        token_hash = hashlib.sha256(token.encode()).hexdigest()
        token_data = settings._reset_tokens.get(token_hash)

        if not token_data:
            raise HTTPException(status_code=400, detail="Invalid or expired token")

        if token_data["expires"] < datetime.now(timezone.utc):
            del settings._reset_tokens[token_hash]
            raise HTTPException(status_code=400, detail="Token expired")

        # Find user and update password
        user = db.query(User).filter_by(id=token_data["user_id"]).first()
        if not user:
            raise HTTPException(status_code=400, detail="User not found")

        user.hashed_password = hash_password(new_password)
        db.commit()

        # Remove used token
        del settings._reset_tokens[token_hash]

        return success_response(None, "Password reset successfully")
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"RESET PASSWORD ERROR: {e}\n{tb}")
        return error_response(None, "Failed to reset password")


@router.post("/verify-email")
def verify_email(payload: dict, db: Session = Depends(get_db)):
    """Verify a native-signup email with the 6-digit Resend code."""
    try:
        email = payload.get("email", "").lower().strip()
        code = (payload.get("code", "") or "").strip()

        if not email or not code:
            raise HTTPException(status_code=400, detail="Email and code required")
        if len(code) != 6 or not code.isdigit():
            raise HTTPException(status_code=400, detail="Invalid verification code")

        user = db.query(User).filter_by(email=email).first()
        if not user:
            # Generic: don't reveal whether the address is registered.
            raise HTTPException(status_code=400, detail="Invalid or expired code")

        uid = _consume_code(db, email, code)
        if uid is None or uid != user.id:
            raise HTTPException(status_code=400, detail="Invalid or expired code")

        user.email_verified = True
        db.commit()
        return success_response(None, "Email verified successfully")
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"VERIFY EMAIL ERROR: {e}\n{tb}")
        return error_response(None, "Failed to verify email")


@router.post("/send-verification")
def send_verification(payload: dict, db: Session = Depends(get_db)):
    """(Re)send the 6-digit verification code. Always a generic response."""
    try:
        email = payload.get("email", "").lower().strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email required")
        user = db.query(User).filter_by(email=email).first()
        sent = False
        if (
            user is not None
            and not bool(getattr(user, "email_verified", False))
            and (user.auth_provider or "local") == "local"
        ):
            sent = bool(_issue_code(db, user))
        return success_response(
            {"sent": sent},
            "If the email exists, a verification code has been sent",
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"SEND VERIFICATION ERROR: {e}")
        return error_response(None, "Failed to send verification code")


_CODE_TTL = timedelta(minutes=10)
_CODE_COOLDOWN = timedelta(seconds=60)


def _as_aware(dt: datetime) -> datetime:
    """Normalize a stored timestamp for comparison (SQLite returns naive,
    Postgres returns aware)."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _issue_code(db: Session, user: User) -> bool:
    """Generate, store (hashed, in DB) and email a 6-digit code.

    DB-backed so codes survive sleeps, restarts and redeploys.
    Returns the sent-flag."""
    from app.models.verification import VerificationCode
    from app.utils.email import send_verification_code

    now = datetime.now(timezone.utc)
    # Opportunistic purge of expired rows.
    db.query(VerificationCode).filter(
        VerificationCode.expires_at < now
    ).delete(synchronize_session=False)
    last = (
        db.query(VerificationCode)
        .filter_by(email=user.email)
        .order_by(VerificationCode.id.desc())
        .first()
    )
    if last is not None and last.created_at is not None:
        created = _as_aware(last.created_at)
        if created is not None and now - created < _CODE_COOLDOWN:
            raise HTTPException(
                status_code=429,
                detail="Code sent recently — check your inbox before requesting another",
            )
    # 6 digits collide occasionally (and stale rows linger) — retry instead
    # of 500ing on the unique hash constraint.
    from sqlalchemy.exc import IntegrityError

    code = None
    for _ in range(5):
        candidate = f"{secrets.randbelow(900000) + 100000:06d}"
        try:
            db.add(
                VerificationCode(
                    user_id=user.id,
                    email=user.email,
                    code_hash=hashlib.sha256(candidate.encode()).hexdigest(),
                    expires_at=now + _CODE_TTL,
                )
            )
            db.commit()
            code = candidate
            break
        except IntegrityError:
            db.rollback()
    if code is None:
        raise HTTPException(status_code=500, detail="Could not issue code")
    return bool(send_verification_code(user.email, code))


def _consume_code(db: Session, email: str, code: str):
    """Single-use redeem. Returns the bound user id, or None."""
    from app.models.verification import VerificationCode

    now = datetime.now(timezone.utc)
    h = hashlib.sha256(code.encode()).hexdigest()
    row = (
        db.query(VerificationCode)
        .filter_by(code_hash=h, used=False)
        .first()
    )
    if not row or row.email != email:
        return None
    if row.expires_at is None or _as_aware(row.expires_at) < now:
        return None
    row.used = True
    db.commit()
    return row.user_id
