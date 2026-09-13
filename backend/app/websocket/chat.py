import json
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.database.connection import SessionLocal
from app.auth.security import decode_token
from app.models.user import User
from app.models.conversation import ConversationMember
from app.websocket.manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_user(token: str):
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        return None
    try:
        uid = int(payload["sub"])
    except (ValueError, TypeError):
        return None
    db = SessionLocal()
    try:
        return db.query(User).filter(User.id == uid).first()
    finally:
        db.close()


@router.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    await _handle_ws(websocket, token)


@router.websocket("/ws/chat/{conversation_id}")
async def websocket_endpoint_conversation(
    websocket: WebSocket, conversation_id: int, token: str = Query(None)
):
    await _handle_ws(websocket, token)


async def _handle_ws(websocket: WebSocket, token: str | None):
    if not token:
        await websocket.close(code=1008)
        return

    user = _get_user(token)
    if not user:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, user.id)

    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.id == user.id).first()
        if db_user:
            db_user.is_online = True
            db.commit()
    except Exception as e:
        logger.error(f"Failed to set user online: {e}")
    finally:
        db.close()

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                try:
                    await websocket.close(code=1001)
                except Exception:
                    pass
                break

            try:
                msg = json.loads(data)
            except (json.JSONDecodeError, ValueError):
                await websocket.send_text(
                    json.dumps(
                        {"type": "error", "payload": {"message": "Invalid JSON"}}
                    )
                )
                continue

            mtype = msg.get("type")
            payload = msg.get("payload", {})

            if mtype == "typing.start":
                await _handle_typing(user.id, payload, True)
            elif mtype == "typing.stop":
                await _handle_typing(user.id, payload, False)
            elif mtype == "ping":
                await websocket.send_text(json.dumps({"type": "pong", "payload": {}}))
            elif mtype == "message.read":
                await _handle_read_receipt(user.id, payload)
            elif mtype in ("call.offer", "call.answer", "call.ice_candidate"):
                await _handle_call_signaling(user.id, mtype, payload)
            else:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "payload": {"message": f"Unknown type {mtype}"},
                        }
                    )
                )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WS error: {e}")
    finally:
        await manager.disconnect(websocket, user.id)
        db = SessionLocal()
        try:
            if not manager.is_online(user.id):
                db_user = db.query(User).filter(User.id == user.id).first()
                if db_user:
                    db_user.is_online = False
                    db_user.last_seen = datetime.now(timezone.utc)
                    db.commit()
        except Exception as e:
            logger.error(f"Failed to set user offline: {e}")
        finally:
            db.close()


async def _handle_typing(user_id: int, payload: dict, is_typing: bool):
    conv_id = payload.get("conversation_id")
    if not conv_id:
        return
    db = SessionLocal()
    try:
        member = (
            db.query(ConversationMember)
            .filter_by(conversation_id=conv_id, user_id=user_id)
            .first()
        )
        if not member:
            return
        member_ids = [
            m.user_id
            for m in db.query(ConversationMember)
            .filter_by(conversation_id=conv_id)
            .all()
        ]
        await manager.send_typing(conv_id, user_id, is_typing, member_ids)
    except Exception as e:
        logger.error(f"Failed to handle typing: {e}")
    finally:
        db.close()


async def _handle_read_receipt(user_id: int, payload: dict):
    conv_id = payload.get("conversation_id")
    message_id = payload.get("message_id")
    if not conv_id or not message_id:
        return
    db = SessionLocal()
    try:
        member = (
            db.query(ConversationMember)
            .filter_by(conversation_id=conv_id, user_id=user_id)
            .first()
        )
        if member:
            old_read = member.last_read_message_id
            if old_read is None or message_id > old_read:
                member.last_read_message_id = message_id
            # Seeing a message implies it reached this device.
            if (member.last_delivered_message_id or 0) < message_id:
                member.last_delivered_message_id = message_id
            db.commit()
            member_ids = [
                m.user_id
                for m in db.query(ConversationMember)
                .filter_by(conversation_id=conv_id)
                .all()
            ]
            await manager.broadcast_to_conversation(
                conv_id,
                {
                    "type": "message.read",
                    "payload": {
                        "conversation_id": conv_id,
                        "message_id": message_id,
                        "user_id": user_id,
                    },
                },
                member_ids=member_ids,
            )
            from app.utils.receipts import broadcast_status_upgrades

            await broadcast_status_upgrades(
                db, conv_id, user_id, old_read, message_id, member_ids
            )
    except Exception as e:
        logger.error(f"Failed to handle read receipt: {e}")
    finally:
        db.close()


async def _handle_call_signaling(user_id: int, mtype: str, payload: dict):
    to_user = (
        payload.get("to_user_id")
        or payload.get("to")
        or payload.get("callee_id")
        or payload.get("caller_id")
    )
    db = SessionLocal()
    try:
        from app.models.call import CallHistory
        from app.models.conversation import ConversationMember

        if not to_user and payload.get("callId"):
            try:
                call = (
                    db.query(CallHistory)
                    .filter_by(id=int(payload.get("callId")))
                    .first()
                )
            except (TypeError, ValueError):
                call = None
            if not call:
                return
            # Only a party of the call may use its id as a relay path.
            if user_id not in (call.caller_id, call.callee_id):
                return
            to_user = call.callee_id if user_id == call.caller_id else call.caller_id

        if to_user:
            try:
                other = int(to_user)
            except (TypeError, ValueError):
                return
            if other == user_id:
                return
            # Strangers must not be able to ring each other: require a shared
            # conversation or an existing call row between the two parties.
            my_convs = [
                c[0]
                for c in db.query(ConversationMember.conversation_id)
                .filter_by(user_id=user_id)
                .all()
            ]
            shares_chat = (
                (
                    db.query(ConversationMember)
                    .filter(
                        ConversationMember.user_id == other,
                        ConversationMember.conversation_id.in_(my_convs),
                    )
                    .first()
                    is not None
                )
                if my_convs
                else False
            )
            if not shares_chat:
                known = (
                    db.query(CallHistory)
                    .filter(
                        (
                            (CallHistory.caller_id == user_id)
                            & (CallHistory.callee_id == other)
                        )
                        | (
                            (CallHistory.caller_id == other)
                            & (CallHistory.callee_id == user_id)
                        )
                    )
                    .first()
                    is not None
                )
                if not known:
                    return
            await manager.send_to_user(
                other,
                {"type": mtype, "payload": {**payload, "from_user_id": user_id}},
            )
        else:
            conv_id = payload.get("conversation_id")
            if conv_id:
                try:
                    cid = int(conv_id)
                except (TypeError, ValueError):
                    return
                member = (
                    db.query(ConversationMember)
                    .filter_by(conversation_id=cid, user_id=user_id)
                    .first()
                )
                if not member:
                    return
                await manager.broadcast_to_conversation(
                    cid,
                    {"type": mtype, "payload": {**payload, "from_user_id": user_id}},
                    exclude_user=user_id,
                )
    except Exception as e:
        logger.error(f"Failed to handle call signaling: {e}")
    finally:
        db.close()
