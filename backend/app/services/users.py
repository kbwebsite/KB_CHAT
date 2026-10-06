"""User-account business rules (Wave 1).

Routes validate request *shape* (Pydantic); this module owns the *decision*
and the mutation. Error messages are byte-identical to the pre-Wave-1
``api/users.py`` handler, which is the live implementation: ``users_router``
is included before ``extended_router`` (``main.py``), so the ``extended.py``
duplicate never served traffic.
"""

from sqlalchemy.orm import Session

from app.auth.security import hash_password, verify_password
from app.models.user import User
from app.services.errors import bad_request


def change_user_password(
    db: Session,
    user: User,
    current_password: str,
    new_password: str,
    *,
    keep_sid: str | None = None,
) -> None:
    """Verify the current password and store a new bcrypt hash.

    Wave 2 Phase 4: all OTHER refresh sessions die with the old password
    (``keep_sid`` — the calling session — survives). Failures raise before
    any mutation, so a wrong password never revokes anything.

    Raises:
        ServiceError(400): new password too short, or current mismatch.
    """
    if len(new_password) < 6:
        raise bad_request("Password must be at least 6 characters")
    if not verify_password(current_password, user.hashed_password):
        raise bad_request("Current password is incorrect")
    user.hashed_password = hash_password(new_password)
    db.commit()
    from app.services import auth_sessions as sessions

    sessions.revoke_user_sessions(
        db, user.id, except_sid=keep_sid, reason="password-change"
    )
