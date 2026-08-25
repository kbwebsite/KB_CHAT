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
async def websocket_endpoint_conversation(websocket: WebSocket, conversation_id: int, token: str = Query(None)):
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
                await websocket.send_text(json.dumps({"type": "error", "payload": {"message": "Invalid JSON"}}))
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
                await websocket.send_text(json.dumps({"type": "error", "payload": {"message": f"Unknown type {mtype}"}}))

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
        member = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=user_id).first()
        if not member:
            return
        member_ids = [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]
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
        member = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=user_id).first()
        if member:
            if member.last_read_message_id is None or message_id > member.last_read_message_id:
                member.last_read_message_id = message_id
                db.commit()
            member_ids = [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]
            await manager.broadcast_to_conversation(conv_id, {
                "type": "message.read",
                "payload": {"conversation_id": conv_id, "message_id": message_id, "user_id": user_id}
            }, member_ids=member_ids)
    except Exception as e:
        logger.error(f"Failed to handle read receipt: {e}")
    finally:
        db.close()

async def _handle_call_signaling(user_id: int, mtype: str, payload: dict):
    to_user = payload.get("to_user_id") or payload.get("to") or payload.get("callee_id") or payload.get("caller_id")
    if not to_user and payload.get("callId"):
        db = SessionLocal()
        try:
            from app.models.call import CallHistory
            call = db.query(CallHistory).filter_by(id=int(payload.get("callId"))).first()
            if call:
                to_user = call.callee_id if user_id == call.caller_id else call.caller_id
        except Exception as e:
            logger.error(f"Failed to resolve call target: {e}")
        finally:
            db.close()

    if to_user:
        await manager.send_to_user(int(to_user), {"type": mtype, "payload": {**payload, "from_user_id": user_id}})
    else:
        conv_id = payload.get("conversation_id")
        if conv_id:
            await manager.broadcast_to_conversation(conv_id, {
                "type": mtype,
                "payload": {**payload, "from_user_id": user_id}
            }, exclude_user=user_id)
