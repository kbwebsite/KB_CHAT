"""Privacy enforcement shared by REST + WebSocket paths.

Rules (single source of truth):
- "contacts" = users who share at least one conversation.
- online_status_visible / last_seen_visible: everyone | contacts | nobody.
  Unknown/empty values fall back to "everyone" (historic default).
- read_receipts off => this user neither sends nor stores read cursors,
  so senders never see blue ticks from them. Delivery (grey ticks) is
  unaffected -- arrival acks still flow.
"""

from sqlalchemy.orm import Session

from app.models.conversation import ConversationMember
from app.models.settings import UserSettings


def get_settings(db: Session, user_id: int) -> UserSettings:
    """Settings row or transient defaults (never None)."""
    s = db.query(UserSettings).filter_by(user_id=user_id).first()
    if s is None:
        s = UserSettings(user_id=user_id)
    return s


def shares_conversation(db: Session, a_id: int, b_id: int) -> bool:
    if a_id == b_id:
        return True
    conv_ids = [
        c[0]
        for c in db.query(ConversationMember.conversation_id)
        .filter_by(user_id=a_id)
        .all()
    ]
    if not conv_ids:
        return False
    return (
        db.query(ConversationMember)
        .filter(
            ConversationMember.conversation_id.in_(conv_ids),
            ConversationMember.user_id == b_id,
        )
        .first()
        is not None
    )


def _scope_allows(scope, is_contact: bool) -> bool:
    scope = (scope or "everyone").lower()
    if scope == "nobody":
        return False
    if scope == "contacts":
        return is_contact
    return True


def presence_for_viewer(db: Session, *, viewer_id: int, target) -> dict:
    """Masked {is_online, last_seen} of target as viewer may see them."""
    if viewer_id == target.id:
        return {
            "is_online": target.is_online,
            "last_seen": target.last_seen.isoformat() if target.last_seen else None,
        }
    s = get_settings(db, target.id)
    contact = shares_conversation(db, viewer_id, target.id)
    online = (
        target.is_online if _scope_allows(s.online_status_visible, contact) else False
    )
    last_seen = target.last_seen.isoformat() if target.last_seen else None
    if not _scope_allows(s.last_seen_visible, contact):
        last_seen = None
    return {"is_online": online, "last_seen": last_seen}


def presence_for_viewers(db: Session, *, viewer_id: int, targets: list) -> dict:
    """Batched presence_for_viewer (Wave 4D).

    The single version costs up to 3 queries per target (settings row +
    two membership queries). This serves any number of targets with 3 fixed
    queries (settings IN + my convs + co-members IN) and shapes each row
    with the identical rules. Returns {target_id: presence}.
    """
    targets = list(targets or [])
    if not targets:
        return {}
    out = {}
    others = []
    for t in targets:
        if t.id == viewer_id:
            out[t.id] = {
                "is_online": t.is_online,
                "last_seen": t.last_seen.isoformat() if t.last_seen else None,
            }
        else:
            others.append(t)
    if not others:
        return out
    settings_by_id = {
        s.user_id: s
        for s in db.query(UserSettings)
        .filter(UserSettings.user_id.in_([t.id for t in others]))
        .all()
    }
    my_convs = [
        c[0]
        for c in db.query(ConversationMember.conversation_id)
        .filter_by(user_id=viewer_id)
        .all()
    ]
    contact_ids = set()
    if my_convs:
        contact_ids = {
            m[0]
            for m in db.query(ConversationMember.user_id)
            .filter(
                ConversationMember.conversation_id.in_(my_convs),
                ConversationMember.user_id != viewer_id,
            )
            .all()
        }
    for t in others:
        s = settings_by_id.get(t.id) or UserSettings(user_id=t.id)
        contact = t.id in contact_ids
        online = (
            t.is_online if _scope_allows(s.online_status_visible, contact) else False
        )
        last_seen = t.last_seen.isoformat() if t.last_seen else None
        if not _scope_allows(s.last_seen_visible, contact):
            last_seen = None
        out[t.id] = {"is_online": online, "last_seen": last_seen}
    return out


def receipts_allowed(db: Session, user_id: int) -> bool:
    """False only when the user explicitly opted out (None => default on)."""
    return get_settings(db, user_id).read_receipts is not False
