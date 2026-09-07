"""Read-receipt helpers shared by the HTTP API and the websocket handler.

Tick semantics (WhatsApp-style):
- "sent"      — single tick: stored on server, not yet on recipient device(s)
- "delivered" — double tick: on recipient device(s), not yet seen
- "read"      — double tick highlighted: seen by recipient(s)

For group chats the upgrade requires ALL other members to have reached
that stage; otherwise the status stays at the lower stage.
"""

from sqlalchemy.orm import Session

from app.models.conversation import ConversationMember
from app.models.message import Message
from app.websocket.manager import manager

STATUS_ORDER = {"sent": 0, "delivered": 1, "read": 2}


def receipt_map(db: Session, conv_id: int) -> dict:
    """{user_id: (last_delivered_id, last_read_id)} for a conversation."""
    rows = db.query(ConversationMember).filter_by(conversation_id=conv_id).all()
    return {
        m.user_id: (
            m.last_delivered_message_id or 0,
            m.last_read_message_id or 0,
        )
        for m in rows
    }


def compute_status(msg_id: int, sender_id, receipts: dict) -> str:
    """Status of one message from the sender's point of view."""
    others = [(d, r) for uid, (d, r) in receipts.items() if uid != sender_id]
    if not others:
        return "sent"
    if all(r >= msg_id for _, r in others):
        return "read"
    if all(d >= msg_id for d, _ in others):
        return "delivered"
    return "sent"


async def broadcast_status_upgrades(
    db: Session,
    conv_id: int,
    reader_id: int,
    old_id,
    new_id: int,
    member_ids: list,
) -> None:
    """Broadcast `message.status` for newly-advanced messages.

    After `reader_id`'s delivered/read cursor moves from old_id to new_id,
    every message in that range authored by someone else may have advanced
    a stage. Only non-"sent" (i.e. changed or noteworthy) stages are sent;
    clients apply forward-only upgrades.
    """
    old_id = old_id or 0
    if new_id <= old_id:
        return
    receipts = receipt_map(db, conv_id)
    affected = (
        db.query(Message)
        .filter(
            Message.conversation_id == conv_id,
            Message.id > old_id,
            Message.id <= new_id,
            Message.sender_id != reader_id,
            Message.is_deleted == False,  # noqa: E712
        )
        .order_by(Message.id.asc())
        .limit(200)
        .all()
    )
    for m in affected:
        status = compute_status(m.id, m.sender_id, receipts)
        if status != "sent":
            await manager.broadcast_to_conversation(
                conv_id,
                {
                    "type": "message.status",
                    "payload": {
                        "message_id": m.id,
                        "conversation_id": conv_id,
                        "status": status,
                    },
                },
                member_ids=member_ids,
            )
