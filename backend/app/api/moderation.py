"""Platform moderation queue (reports + admin user actions).

Any signed-in user may file a report; only admins may read or resolve.
Adminship is the `users.is_admin` flag (nullable, NULL reads as False so
old databases never 500) OR membership in the `ADMIN_EMAILS` env allowlist
(bootstrap path — no admin exists by default). Resolutions are recorded on
the report row (audit trail); reports are never deleted.
"""

import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ai.provider import ServiceProvider, get_ai_provider
from app.auth.dependencies import get_current_user
from app.database.config import settings
from app.database.connection import Base, get_db
from app.models.auth_session import AuthSession
from app.models.ban import EmailBan
from app.models.conversation import Conversation
from app.models.message import Attachment, Message, MessageReaction
from app.models.passkey import PasskeyCredential, WebauthnChallenge
from app.models.push_token import DeviceToken
from app.models.report import REPORT_ACTIONS, REPORT_REASONS, Report
from app.models.session import UserSession
from app.models.user import User
from app.models.verification import VerificationCode
from app.schemas.common import success_response

router = APIRouter(prefix="/api/moderation", tags=["moderation"])

# Deactivated users file reactivation requests as ordinary user-reports so
# they land in the same admin queue. This prefix marks them (and suppresses
# duplicates while one is still open).
APPEAL_PREFIX = "🔓 Reactivation appeal: "


def is_admin_user(user: User) -> bool:
    """True for flagged admins or env-allowlisted bootstrap emails."""
    try:
        if bool(getattr(user, "is_admin", False)):
            return True
    except Exception:
        pass
    try:
        allowed = {
            e.strip().lower()
            for e in (settings.ADMIN_EMAILS or "").split(",")
            if e.strip()
        }
        return bool(user.email) and user.email.lower() in allowed
    except Exception:
        return False


def require_admin(user: User) -> None:
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin privileges required")


def _target_summary(db: Session, target_type: str, target_id: int) -> dict:
    if target_type == "message":
        msg = db.query(Message).filter_by(id=target_id).first()
        if not msg:
            return {}
        sender = db.query(User).filter_by(id=msg.sender_id).first()
        return {
            "message_id": msg.id,
            "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id,
            "sender_username": sender.username if sender else None,
            "snippet": (msg.content or "")[:140],
            "is_deleted": bool(msg.is_deleted),
        }
    if target_type == "user":
        u = db.query(User).filter_by(id=target_id).first()
        if not u:
            return {}
        return {
            "user_id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "is_active": bool(u.is_active),
        }
    conv = db.query(Conversation).filter_by(id=target_id).first()
    if not conv:
        return {}
    return {
        "conversation_id": conv.id,
        "is_group": bool(conv.is_group),
    }


def _report_to_dict(db: Session, r: Report) -> dict:
    reporter = db.query(User).filter_by(id=r.reporter_id).first()
    return {
        "id": r.id,
        "reporter_id": r.reporter_id,
        "reporter_username": reporter.username if reporter else None,
        "target_type": r.target_type,
        "target_id": r.target_id,
        "target": _target_summary(db, r.target_type, r.target_id),
        "reason": r.reason,
        "details": r.details,
        "status": r.status,
        "action_taken": r.action_taken,
        "resolved_by": r.resolved_by,
        "ai_score": r.ai_score,
        "ai_label": r.ai_label,
        "ai_summary": r.ai_summary,
        "ai_description": r.ai_description,
        "ai_analyzed_at": r.ai_analyzed_at.isoformat() if r.ai_analyzed_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
    }


def _reported_user_id(db: Session, row: Report) -> int | None:
    """Author account behind a user/message report (conversation -> None)."""
    if row.target_type == "user":
        return row.target_id
    if row.target_type == "message":
        msg = db.query(Message).filter_by(id=row.target_id).first()
        return msg.sender_id if msg else None
    return None


def _guard_account_action(target: User, current_user: User, verb: str) -> None:
    """Refuse self-harm and actions against fellow admins."""
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id or is_admin_user(target):
        raise HTTPException(status_code=400, detail=f"Cannot {verb} this account")


def _ban_email(db: Session, email: str, reason: str, created_by: int | None) -> None:
    """Block an address from (re-)registering. Idempotent."""
    email = (email or "").lower().strip()
    if not email or "@" not in email:
        return
    if not db.query(EmailBan).filter_by(email=email).first():
        db.add(EmailBan(email=email, reason=reason, created_by=created_by))


def _remove_user(db: Session, target: User, deleter_id: int | None = None) -> dict:
    """Delete an account: scrub identity, kill sessions/credentials.

    The row stays (history + audit integrity) but PII is wiped. The
    original address is blocked from re-registering (see email_bans), so
    a deleted user cannot simply open a fresh account on the same email.
    Messages keep their text with sender nulled by the DB where supported.
    """
    original_email = (target.email or "").lower()
    stamp = int(time.time())
    _ban_email(db, original_email, "account_deleted", deleter_id)
    target.username = f"deleted_user_{target.id}"
    target.email = f"deleted_{target.id}_{stamp}@deleted.local"
    target.display_name = "Deleted user"
    target.hashed_password = secrets.token_hex(32)
    target.avatar_url = None
    target.about = None
    target.status_message = None
    target.identity_pubkey = None
    target.email_verified = False
    target.is_admin = False
    target.is_active = False
    db.query(PasskeyCredential).filter_by(user_id=target.id).delete(
        synchronize_session=False
    )
    db.query(WebauthnChallenge).filter_by(user_id=target.id).delete(
        synchronize_session=False
    )
    db.query(AuthSession).filter_by(user_id=target.id).delete(synchronize_session=False)
    db.query(UserSession).filter_by(user_id=target.id).delete(synchronize_session=False)
    db.query(DeviceToken).filter_by(user_id=target.id).delete(synchronize_session=False)
    db.query(VerificationCode).filter_by(user_id=target.id).delete(
        synchronize_session=False
    )
    db.commit()
    db.refresh(target)
    return _user_admin_view(target)


def _erase_user(db: Session, target: User, eraser_id: int | None = None) -> None:
    """Remove an account everywhere: no row may reference them afterwards.

    - Their messages + uploaded file records are deleted outright.
    - Every other table with a FK to users.id is swept: nullable columns
      are nulled (shared entities like groups/channels survive), non-null
      columns lose their rows (memberships, votes, sessions, settings…).
    - Plain-integer references (reports) are deleted / nulled explicitly.
    - Their address is blocked from re-registering.
    Uploaded blobs on disk/CDN are orphaned (limitation, noted in docs).
    """
    uid = target.id
    email = (target.email or "").lower()
    _ban_email(db, email, "account_removed", eraser_id)
    msg_ids = [m for (m,) in db.query(Message.id).filter_by(sender_id=uid).all()]
    if msg_ids:
        db.query(Attachment).filter(Attachment.message_id.in_(msg_ids)).delete(
            synchronize_session=False
        )
        db.query(MessageReaction).filter(
            MessageReaction.message_id.in_(msg_ids)
        ).delete(synchronize_session=False)
    db.query(Attachment).filter_by(uploader_id=uid).delete(synchronize_session=False)
    db.query(Message).filter_by(sender_id=uid).delete(synchronize_session=False)
    for table in Base.metadata.tables.values():
        if table.name in ("users", "email_bans", "messages", "attachments"):
            continue
        for fk in table.foreign_keys:
            if fk.column.table.name != "users" or fk.column.name != "id":
                continue
            col = fk.parent
            if col.nullable:
                db.execute(table.update().where(col == uid).values({col.name: None}))
            else:
                db.execute(table.delete().where(col == uid))
    # Reports carry plain-integer user references (no FK): drop rows about
    # them, null the resolver slot on the rest.
    db.query(Report).filter_by(reporter_id=uid).delete(synchronize_session=False)
    db.query(Report).filter_by(target_type="user", target_id=uid).delete(
        synchronize_session=False
    )
    for r in db.query(Report).filter_by(resolved_by=uid).all():
        r.resolved_by = None
    db.query(User).filter_by(id=uid).delete(synchronize_session=False)
    db.commit()


@router.post("/reports")
def create_report(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_type = str(payload.get("target_type") or "").strip().lower()
    target_id = payload.get("target_id")
    reason = str(payload.get("reason") or "").strip().lower()
    details = payload.get("details")
    if target_type not in ("message", "user", "conversation"):
        raise HTTPException(status_code=400, detail="Invalid target type")
    if not isinstance(target_id, int):
        raise HTTPException(status_code=400, detail="Invalid target id")
    if reason not in REPORT_REASONS:
        raise HTTPException(status_code=400, detail="Invalid reason")
    if _target_summary(db, target_type, target_id) == {}:
        raise HTTPException(status_code=404, detail="Report target not found")
    row = Report(
        reporter_id=current_user.id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        details=str(details)[:1000] if details else None,
        status="open",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return success_response(_report_to_dict(db, row), "Report submitted")


@router.get("/reports")
def list_reports(
    status: str = "open",
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    if status not in ("open", "resolved", "all"):
        raise HTTPException(status_code=400, detail="Invalid status filter")
    limit = max(1, min(int(limit or 50), 200))
    q = db.query(Report).order_by(Report.id.desc())
    if status != "all":
        q = q.filter_by(status="open" if status == "open" else "resolved")
    rows = q.limit(limit).all()
    return success_response([_report_to_dict(db, r) for r in rows])


@router.post("/reports/{report_id}/analyze")
async def analyze_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Agentic triage: look at the images first, then judge.

    Step 1 (OBSERVE) shows every attached/linked image to a vision model
    for a factual description; step 2 (JUDGE) scores reason + text +
    descriptions. Requires a live AI key (503 otherwise — never
    mock-judge anyone)."""
    require_admin(current_user)
    row = db.query(Report).filter_by(id=report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if not settings.AI_API_KEY:
        raise HTTPException(status_code=503, detail="AI key not configured")
    from app.ai.triage import (
        MAX_IMAGES,
        describe_images,
        extract_image_urls,
        fetch_image,
        judge,
    )

    provider = get_ai_provider()
    if isinstance(provider, ServiceProvider):
        raise HTTPException(status_code=503, detail="AI key not configured")

    images: list = []
    notes: list = []

    def _take_attachment(att) -> None:
        if len(images) >= MAX_IMAGES:
            return
        mime = str(getattr(att, "mime_type", "") or "").lower()
        name = (
            getattr(att, "original_filename", None)
            or getattr(att, "filename", None)
            or "file"
        )
        if mime.startswith("image/"):
            url = getattr(att, "cloudinary_url", None)
            if url:
                images.append({"url": url, "ref": name})
                return
            stored = getattr(att, "file_path", None)
            if stored:
                try:
                    import os as _os

                    base = _os.path.abspath(settings.upload_dir_abs)
                    path = _os.path.abspath(_os.path.join(base, stored))
                    if not path.startswith(base):
                        raise ValueError("outside upload dir")
                    with open(path, "rb") as f:
                        data = f.read(6 * 1024 * 1024)
                    images.append(
                        {"mime": mime or "image/jpeg", "data": data, "ref": name}
                    )
                except Exception as e:
                    notes.append(f"{name}: (unreadable attachment — {str(e)[:80]})")
            else:
                notes.append(f"{name}: (no retrievable copy)")
        elif mime.startswith("video/"):
            notes.append(f"{name}: (video attached — frames not reviewed)")

    if row.target_type == "message":
        msg = db.query(Message).filter_by(id=row.target_id).first()
        if not msg or msg.is_deleted:
            raise HTTPException(status_code=404, detail="Reported message not found")
        if msg.is_encrypted or msg.view_once:
            raise HTTPException(status_code=400, detail="Cannot analyze sealed content")
        for att in db.query(Attachment).filter_by(message_id=msg.id).all():
            _take_attachment(att)
        text = (msg.content or "").strip()
        for url in extract_image_urls(text):
            if len(images) >= MAX_IMAGES:
                break
            mime, data = await fetch_image(url)
            if mime and data:
                images.append(
                    {"mime": mime, "data": data, "ref": url.split("?")[0][-60:]}
                )
            else:
                notes.append(
                    f"{url.split('?')[0][-60:]}: (link unreachable or not an image)"
                )
        evidence = text[:1000]
        if not evidence and not images and not notes:
            raise HTTPException(
                status_code=400, detail="Nothing analyzable on this message"
            )
    elif row.target_type == "user":
        target = db.query(User).filter_by(id=row.target_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Reported user not found")
        recent = (
            db.query(Message)
            .filter(
                Message.sender_id == target.id,
                Message.is_deleted == False,  # noqa: E712
                Message.is_encrypted == False,  # noqa: E712
            )
            .order_by(Message.id.desc())
            .limit(5)
            .all()
        )
        for m in recent:
            for att in db.query(Attachment).filter_by(message_id=m.id).all():
                _take_attachment(att)
                if len(images) >= MAX_IMAGES:
                    break
            if len(images) >= MAX_IMAGES:
                break
        evidence = "\n".join(
            f"- {(m.content or '')[:200]}" for m in recent if m.content
        )
        if not evidence.strip() and not images and not notes:
            raise HTTPException(
                status_code=400, detail="No analyzable content from this user"
            )
    else:
        raise HTTPException(
            status_code=400, detail="Conversation reports need human review"
        )
    try:
        descriptions = notes + await describe_images(provider, images)
        verdict = await judge(
            provider, reason=row.reason, text=evidence, descriptions=descriptions
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Analysis failed: {e}")
    row.ai_score = verdict["score"]
    row.ai_label = verdict["label"]
    row.ai_summary = verdict["summary"]
    row.ai_description = "\n".join(descriptions)[:1000] or None
    row.ai_analyzed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return success_response(_report_to_dict(db, row), "Analysis stored")


@router.post("/reports/{report_id}/resolve")
def resolve_report(
    report_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    action = str((payload or {}).get("action") or "").strip().lower()
    if action not in REPORT_ACTIONS:
        raise HTTPException(status_code=400, detail="Invalid action")
    row = db.query(Report).filter_by(id=report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row.status != "open":
        raise HTTPException(status_code=400, detail="Report already resolved")
    now = datetime.now(timezone.utc)
    if action == "dismissed":
        pass
    elif action == "message_deleted":
        if row.target_type != "message":
            raise HTTPException(
                status_code=400, detail="message_deleted needs a message report"
            )
        msg = db.query(Message).filter_by(id=row.target_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Reported message not found")
        msg.is_deleted = True
    elif action == "user_deactivated":
        uid = _reported_user_id(db, row)
        target = db.query(User).filter_by(id=uid).first() if uid else None
        _guard_account_action(target, current_user, "deactivate")
        target.is_active = False
    elif action == "user_deleted":
        uid = _reported_user_id(db, row)
        target = db.query(User).filter_by(id=uid).first() if uid else None
        _guard_account_action(target, current_user, "delete")
        _remove_user(db, target, current_user.id)
    elif action == "appeal_approved":
        if row.target_type != "user" or not (row.details or "").startswith(
            APPEAL_PREFIX
        ):
            raise HTTPException(
                status_code=400, detail="appeal_approved needs an appeal report"
            )
        target = db.query(User).filter_by(id=row.target_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Reported user not found")
        target.is_active = True
        unbanned = (
            db.query(EmailBan).filter_by(email=(target.email or "").lower()).first()
        )
        if unbanned:
            db.delete(unbanned)
    row.status = "resolved"
    row.action_taken = action
    row.resolved_by = current_user.id
    row.resolved_at = now
    db.commit()
    db.refresh(row)
    return success_response(_report_to_dict(db, row), f"Report {action}")


def _user_admin_view(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "display_name": u.display_name,
        "is_active": bool(u.is_active),
        "is_admin": is_admin_user(u),
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


def _user_admin_view_db(db: Session, u: User) -> dict:
    """Admin view plus whether the login email is currently blocked."""
    view = _user_admin_view(u)
    try:
        view["email_banned"] = (
            db.query(EmailBan).filter_by(email=(u.email or "").lower()).first()
            is not None
        )
    except Exception:
        view["email_banned"] = False
    return view


@router.get("/users")
def list_users(
    search: str = "",
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    limit = max(1, min(int(limit or 30), 100))
    q = db.query(User).order_by(User.id.desc())
    term = (search or "").strip().lower()
    if term:
        like = f"%{term}%"
        q = q.filter(
            (User.username.ilike(like))
            | (User.email.ilike(like))
            | (User.display_name.ilike(like))
        )
    return success_response([_user_admin_view_db(db, u) for u in q.limit(limit).all()])


@router.post("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    target = db.query(User).filter_by(id=user_id).first()
    _guard_account_action(target, current_user, "deactivate")
    target.is_active = False
    db.commit()
    return success_response(_user_admin_view(target), "User deactivated")


@router.post("/users/{user_id}/delete")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently remove an account (identity scrubbed, history kept).

    Same guards as deactivation: never yourself, never a fellow admin.
    """
    require_admin(current_user)
    target = db.query(User).filter_by(id=user_id).first()
    _guard_account_action(target, current_user, "delete")
    return success_response(_remove_user(db, target, current_user.id), "User deleted")


@router.post("/users/{user_id}/reactivate")
def reactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    target = db.query(User).filter_by(id=user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_active = True
    db.commit()
    return success_response(_user_admin_view(target), "User reactivated")


def _admin_contact_email() -> str | None:
    try:
        emails = [
            e.strip() for e in (settings.ADMIN_EMAILS or "").split(",") if e.strip()
        ]
        return emails[0] if emails else None
    except Exception:
        return None


@router.post("/users/{user_id}/set-admin")
def set_admin(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Grant or revoke the admin flag. Never your own (no lockouts)."""
    require_admin(current_user)
    target = db.query(User).filter_by(id=user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own admin flag")
    make_admin = bool((payload or {}).get("is_admin", True))
    target.is_admin = make_admin
    db.commit()
    return success_response(
        _user_admin_view(target),
        "Admin granted" if make_admin else "Admin revoked",
    )


@router.get("/audit")
def audit_log(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Who did what: resolved reports newest-first with actor names."""
    require_admin(current_user)
    limit = max(1, min(int(limit or 50), 200))
    rows = (
        db.query(Report)
        .filter(Report.status != "open")
        .order_by(Report.id.desc())
        .limit(limit)
        .all()
    )
    out = []
    for r in rows:
        actor = (
            db.query(User).filter_by(id=r.resolved_by).first()
            if r.resolved_by
            else None
        )
        out.append(
            {
                "id": r.id,
                "action_taken": r.action_taken,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "target": _target_summary(db, r.target_type, r.target_id),
                "actor_username": actor.username if actor else None,
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            }
        )
    return success_response(out)


@router.post("/users/{user_id}/erase")
def erase_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove an account everywhere: user row plus every row referencing it.

    Stronger than delete (which scrubs but keeps history). Same guards:
    never yourself, never a fellow admin.
    """
    require_admin(current_user)
    target = db.query(User).filter_by(id=user_id).first()
    _guard_account_action(target, current_user, "remove")
    _erase_user(db, target, current_user.id)
    return success_response({"id": user_id}, "User removed everywhere")


@router.get("/bans")
def list_bans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    rows = db.query(EmailBan).order_by(EmailBan.id.desc()).limit(200).all()
    return success_response(
        [
            {
                "id": b.id,
                "email": b.email,
                "reason": b.reason,
                "created_by": b.created_by,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in rows
        ]
    )


@router.post("/bans")
def create_ban(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ban an address: block (re-)registration, deactivate a live account.

    Accepts an email or a user_id (report cards ban the reported author).
    Refuses addresses belonging to yourself or a fellow admin.
    """
    require_admin(current_user)
    email = str((payload or {}).get("email") or "").lower().strip()
    target = None
    user_id = (payload or {}).get("user_id")
    if user_id is not None:
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid user id")
        target = db.query(User).filter_by(id=user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        email = (target.email or "").lower()
    reason = str((payload or {}).get("reason") or "banned").strip().lower()[:40]
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    if not target:
        target = db.query(User).filter_by(email=email).first()
    if target and (target.id == current_user.id or is_admin_user(target)):
        raise HTTPException(status_code=400, detail="Cannot ban this account")
    if target:
        target.is_active = False
    _ban_email(db, email, reason or "banned", current_user.id)
    db.commit()
    return success_response(
        {"email": email, "deactivated": target is not None}, "Email banned"
    )


@router.delete("/bans/{ban_id}")
def remove_ban(
    ban_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unban: the address may register / be reactivated again."""
    require_admin(current_user)
    row = db.query(EmailBan).filter_by(id=ban_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Ban not found")
    db.delete(row)
    db.commit()
    return success_response({"email": row.email}, "Ban lifted")


@router.get("/appeal-info")
def appeal_info():
    """Public: where a deactivated user can reach a human (shown on login)."""
    return success_response({"contact_email": _admin_contact_email()})


@router.post("/appeals")
def file_appeal(payload: dict, db: Session = Depends(get_db)):
    """Public: a deactivated user asks for reactivation.

    No login possible, so this is unauthenticated by design. Always answers
    success (no account enumeration); a real match files one open appeal
    report — duplicates suppressed while one is still open.
    """
    email = str((payload or {}).get("email") or "").lower().strip()
    message = str((payload or {}).get("message") or "").strip()[:1000]
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    user = db.query(User).filter_by(email=email).first()
    if user is not None and not user.is_active:
        existing = (
            db.query(Report)
            .filter_by(target_type="user", target_id=user.id, status="open")
            .order_by(Report.id.desc())
            .limit(20)
            .all()
        )
        if not any((r.details or "").startswith(APPEAL_PREFIX) for r in existing):
            db.add(
                Report(
                    reporter_id=user.id,
                    target_type="user",
                    target_id=user.id,
                    reason="other",
                    details=f"{APPEAL_PREFIX}{message or 'Please review my account.'}",
                    status="open",
                )
            )
            db.commit()
    return success_response(
        {"received": True},
        "Request received — an admin will review your account.",
    )


@router.get("/stats")
def platform_stats(
    days: int = 14,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Platform overview for the admin console (counts + 14-day series).

    All queries are bounded aggregates; no message content leaves the
    server (only counts and per-day buckets).
    """
    require_admin(current_user)
    days = max(1, min(int(days or 14), 60))
    # Naive UTC for SQL bounds (SQLite stores naive datetimes; Postgres
    # compares fine against naive values for these overview buckets).
    now = datetime.utcnow()
    since = now - timedelta(days=days)

    def day_series(day_col):
        rows = (
            db.query(func.date(day_col).label("day"), func.count().label("n"))
            .filter(day_col >= since)
            .group_by(func.date(day_col))
            .all()
        )
        # func.date yields str on SQLite, date on Postgres — normalize.
        out = {str(r.day): r.n for r in rows}
        return [
            {
                "date": (since + timedelta(days=i)).date().isoformat(),
                "count": out.get((since + timedelta(days=i)).date().isoformat(), 0),
            }
            for i in range(days)
        ]

    reasons = (
        db.query(Report.reason, func.count().label("n")).group_by(Report.reason).all()
    )
    open_rows = (
        db.query(Report)
        .filter_by(status="open")
        .order_by(Report.id.desc())
        .limit(200)
        .all()
    )
    return success_response(
        {
            "users": {
                "total": db.query(func.count(User.id)).scalar() or 0,
                "active": db.query(func.count(User.id))
                .filter(User.is_active.is_(True))
                .scalar()
                or 0,
                "deactivated": db.query(func.count(User.id))
                .filter(User.is_active.is_(False))
                .scalar()
                or 0,
                "new_7d": db.query(func.count(User.id))
                .filter(User.created_at >= now - timedelta(days=7))
                .scalar()
                or 0,
                "per_day": day_series(User.created_at),
            },
            "messages": {
                "total": db.query(func.count(Message.id)).scalar() or 0,
                "per_day": day_series(Message.created_at),
            },
            "conversations": {
                "total": db.query(func.count(Conversation.id)).scalar() or 0,
                "groups": db.query(func.count(Conversation.id))
                .filter(Conversation.is_group.is_(True))
                .scalar()
                or 0,
            },
            "reports": {
                "open": db.query(func.count(Report.id))
                .filter_by(status="open")
                .scalar()
                or 0,
                "resolved": db.query(func.count(Report.id))
                .filter(Report.status != "open")
                .scalar()
                or 0,
                "appeals_open": sum(
                    1
                    for r in open_rows
                    if r.target_type == "user"
                    and (r.details or "").startswith(APPEAL_PREFIX)
                ),
                "by_reason": [{"reason": r, "count": n} for r, n in reasons],
            },
        }
    )
