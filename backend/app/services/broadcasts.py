"""Broadcast membership rules (PE-2G).

Membership is a serialized JSON id list on ``BroadcastList.member_ids``
(no membership table by design — works on SQLite + Postgres). This module
owns the *decisions* and mutations; routes validate request shape and
format responses with ``_list_to_dict`` (which stays in
``api/broadcasts.py``). Owner-only throughout, 404-masked so existence
never leaks to non-owners (same convention as the existing delete route).

Concurrency note: concurrent add/remove is last-write-wins on the JSON
cell — acceptable at this cardinality (bounded by MAX_BROADCAST_MEMBERS).
"""

from sqlalchemy.orm import Session

from app.models.broadcast import BroadcastList
from app.models.user import User
from app.services.errors import bad_request, not_found

#: Conservative bound for the membership write path. Send fans out
#: synchronously in one request, so growth stays capped. Legacy lists above
#: the cap remain valid; adds are blocked until below it.
MAX_BROADCAST_MEMBERS = 50


def get_owned_list(db: Session, list_id: int, owner_id: int) -> BroadcastList:
    bl = db.query(BroadcastList).filter_by(id=list_id, owner_id=owner_id).first()
    if not bl:
        raise not_found("Broadcast list not found")
    return bl


def _stored_ids(bl: BroadcastList) -> list:
    ids = bl.member_ids or []
    return [i for i in ids if isinstance(i, int)]


def resolve_member(db: Session, *, user_id=None, username=None) -> User:
    """Exactly one target identifier; self-adds rejected here, unknown → 404."""
    if user_id is not None and username is not None:
        raise bad_request("Provide user_id or username, not both")
    target = None
    if user_id is not None:
        try:
            uid = int(user_id)
        except (TypeError, ValueError):
            raise bad_request("Invalid user_id")
        target = db.query(User).filter_by(id=uid).first()
    elif username is not None:
        clean = str(username).strip().lstrip("@").lower()
        if not clean:
            raise bad_request("Username required")
        target = db.query(User).filter_by(username=clean).first()
    else:
        raise bad_request("user_id or username required")
    if not target:
        raise not_found("User not found")
    return target


def list_members(db: Session, *, list_id: int, owner_id: int) -> tuple:
    """(list, resolved member dicts). Dead ids are skipped in members but
    kept in storage (send already tolerates them)."""
    bl = get_owned_list(db, list_id, owner_id)
    ids = _stored_ids(bl)
    users = db.query(User).filter(User.id.in_(ids)).all() if ids else []
    by_id = {u.id: u for u in users}
    members = [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
        }
        for i in ids
        if (u := by_id.get(i)) is not None
    ]
    return bl, members


def add_member(
    db: Session, *, list_id: int, owner_id: int, user_id=None, username=None
) -> tuple:
    """(list, added: bool). Idempotent: duplicates report success without
    writing. Blocks are NOT checked here — creation doesn't either, and
    send skips blocked recipients (semantics preserved)."""
    bl = get_owned_list(db, list_id, owner_id)
    target = resolve_member(db, user_id=user_id, username=username)
    if target.id == owner_id:
        raise bad_request("Cannot add yourself")
    ids = _stored_ids(bl)
    if target.id in ids:
        return bl, False
    if len(ids) >= MAX_BROADCAST_MEMBERS:
        raise bad_request(f"List is full ({MAX_BROADCAST_MEMBERS} members)")
    bl.member_ids = [*ids, target.id]
    db.commit()
    db.refresh(bl)
    return bl, True


def remove_member(db: Session, *, list_id: int, owner_id: int, user_id: int) -> tuple:
    """(list, removed: bool). Absent ids report success without writing
    (RFC DELETE idempotency, deterministic)."""
    bl = get_owned_list(db, list_id, owner_id)
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        raise bad_request("Invalid user_id")
    ids = _stored_ids(bl)
    if uid not in ids:
        return bl, False
    bl.member_ids = [i for i in ids if i != uid]
    db.commit()
    db.refresh(bl)
    return bl, True
