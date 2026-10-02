from datetime import datetime, timezone

from app.database.connection import SessionLocal
from app.models.conversation import Conversation
from app.models.message import Message


def _as_utc(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def sweep_disappearing_messages(batch: int = 200):
    """Mark past-TTL messages deleted (WhatsApp-style disappearing messages).

    Runs from the lifespan loop; a no-op when no conversation has a timer.
    View-once rows keep their own lifecycle and are never swept. Clients
    update live via the same message.deleted event as manual deletes.
    """
    db = SessionLocal()
    try:
        convs = (
            db.query(Conversation)
            .filter(Conversation.disappearing_seconds.isnot(None))
            .all()
        )
        if not convs:
            return
        from app.api.messages import _broadcast_soon, _member_ids

        now = datetime.now(timezone.utc)
        for conv in convs:
            ttl = conv.disappearing_seconds or 0
            if ttl <= 0:
                continue
            candidates = (
                db.query(Message)
                .filter(
                    Message.conversation_id == conv.id,
                    Message.is_deleted == False,  # noqa: E712
                )
                .order_by(Message.id.asc())
                .limit(batch)
                .all()
            )
            expired = []
            for m in candidates:
                if m.view_once:
                    continue
                created = _as_utc(m.created_at)
                if created is None:
                    continue
                if (now - created).total_seconds() >= ttl:
                    expired.append(m)
            if not expired:
                continue
            member_ids = _member_ids(db, conv.id)
            for m in expired:
                m.is_deleted = True
                m.content = "Message deleted"
                m.deleted_at = now
                _broadcast_soon(
                    conv.id,
                    {
                        "type": "message.deleted",
                        "payload": {
                            "id": m.id,
                            "conversation_id": conv.id,
                            "is_deleted": True,
                            "content": "Message deleted",
                        },
                    },
                    member_ids=member_ids,
                )
            db.commit()
    except Exception as e:
        print(f"[disappearing] sweep skipped: {e}")
    finally:
        try:
            db.close()
        except Exception:
            pass
