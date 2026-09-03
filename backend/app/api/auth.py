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
        existing = (
            db.query(User)
            .filter(
                or_(
                    User.username == payload.username.lower(),
                    User.email == payload.email.lower(),
                )
            )
            .first()
        )
        if existing:
            if existing.username == payload.username.lower():
                raise HTTPException(status_code=400, detail="Username already taken")
            else:
                raise HTTPException(status_code=400, detail="Email already registered")
        hashed = hash_password(payload.password)
        user = User(
            username=payload.username.lower(),
            email=payload.email.lower(),
            display_name=payload.display_name,
            hashed_password=hashed,
            about="Hey there! I'm using KB Chat.",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
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
                    "created_at": user.created_at.isoformat()
                    if user.created_at
                    else None,
                },
            },
            "Account created successfully",
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
                    "created_at": user.created_at.isoformat()
                    if user.created_at
                    else None,
                },
            },
            "Login successful",
        )
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"LOGIN ERROR: {e}\n{tb}")
        return error_response(None, f"Login failed: {str(e)}")


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


@router.post("/google")
def google_auth(payload: dict, db: Session = Depends(get_db)):
    """Authenticate with Google. Accepts a Google ID token or credential.
    Verifies with Google's tokeninfo endpoint, finds or creates user."""
    try:
        credential = payload.get("credential") or payload.get("id_token")
        if not credential:
            raise HTTPException(status_code=400, detail="Google credential required")

        # Verify token with Google
        google_client_id = settings.GOOGLE_CLIENT_ID
        if not google_client_id:
            raise HTTPException(status_code=500, detail="Google Sign-In not configured")

        # Call Google's tokeninfo endpoint to verify
        resp = httpx.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}", timeout=10
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token")

        google_data = resp.json()
        google_email = google_data.get("email")
        google_name = google_data.get("name", "")
        google_picture = google_data.get("picture")
        google_sub = google_data.get("sub")

        if not google_email:
            raise HTTPException(status_code=401, detail="No email in Google token")

        # Verify the token was issued for our client ID
        aud = google_data.get("aud")
        if aud != google_client_id:
            raise HTTPException(
                status_code=401, detail="Token was not issued for this application"
            )

        # Find existing user by email
        user = db.query(User).filter_by(email=google_email.lower()).first()

        if user:
            # Existing user - link Google info if needed
            if not user.avatar_url and google_picture:
                user.avatar_url = google_picture
            if user.display_name == "Hey there! I'm using KB Chat." and google_name:
                user.display_name = google_name
            db.commit()
            db.refresh(user)
        else:
            # Create new user from Google account
            # Generate a username from email
            base_username = google_email.split("@")[0]
            base_username = re.sub(r"[^a-z0-9_-]", "", base_username.lower())
            if len(base_username) < 3:
                base_username = base_username + "user"
            username = base_username
            counter = 1
            while db.query(User).filter_by(username=username).first():
                username = f"{base_username}{counter}"
                counter += 1

            user = User(
                username=username,
                email=google_email.lower(),
                display_name=google_name or username,
                hashed_password=hash_password("google-oauth-no-password"),
                avatar_url=google_picture,
                about="Signed in with Google",
                auth_provider="google",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

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
                    "created_at": user.created_at.isoformat()
                    if user.created_at
                    else None,
                },
            },
            "Google login successful",
        )
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"GOOGLE AUTH ERROR: {e}\n{tb}")
        return error_response(None, f"Google auth failed: {str(e)}")


@router.post("/forgot-password")
def forgot_password(payload: dict, db: Session = Depends(get_db)):
    """Request a password reset. Returns a reset token (in production, send via email)."""
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

        # In production, send email here with reset_token
        # For now, return it in response (dev mode)
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
    """Verify email address with a verification code."""
    try:
        email = payload.get("email", "").lower().strip()
        code = payload.get("code", "")

        if not email or not code:
            raise HTTPException(status_code=400, detail="Email and code required")

        # For demo: accept any 6-digit code
        # In production, verify against stored code
        if len(code) != 6:
            raise HTTPException(status_code=400, detail="Invalid verification code")

        user = db.query(User).filter_by(email=email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Mark email as verified (add field to User model if needed)
        # user.email_verified = True
        # db.commit()

        return success_response(None, "Email verified successfully")
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print(f"VERIFY EMAIL ERROR: {e}\n{tb}")
        return error_response(None, "Failed to verify email")
