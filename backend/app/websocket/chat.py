import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, HTTPException
from jose import JWTError
from sqlalchemy.orm import Session
from app.database.connection import SessionLocal
from app.auth.security import decode_token
from app.models.user import User
from app.models.conversation import ConversationMember
from app.websocket.manager import manager

router = APIRouter()

def get_user_from_token(token: str, db: Session):
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        return None
    try:
        uid = int(payload["sub"])
    except:
        return None
    return db.query(User).filter(User.id == uid).first()

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
    db = SessionLocal()
    try:
        user = get_user_from_token(token, db)
        if not user:
            await websocket.close(code=1008)
            return
        await manager.connect(websocket, user.id)
        # set online
        try:
            user.is_online = True
            db.commit()
        except:
            pass
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    msg = json.loads(data)
                except:
                    await websocket.send_text(json.dumps({"type": "error", "payload": {"message": "Invalid JSON"}}))
                    continue
                # validate
                mtype = msg.get("type")
                payload = msg.get("payload", {})
                if mtype == "typing.start" or mtype == "typing.stop":
                    conv_id = payload.get("conversation_id")
                    if not conv_id:
                        continue
                    # verify membership
                    member = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=user.id).first()
                    if not member:
                        continue
                    member_ids = [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]
                    is_typing = mtype == "typing.start"
                    await manager.send_typing(conv_id, user.id, is_typing, member_ids)
                elif mtype == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "payload": {}}))
                elif mtype == "message.read":
                    # client notifying read
                    conv_id = payload.get("conversation_id")
                    message_id = payload.get("message_id")
                    if conv_id and message_id:
                        member = db.query(ConversationMember).filter_by(conversation_id=conv_id, user_id=user.id).first()
                        if member:
                            if member.last_read_message_id is None or message_id > member.last_read_message_id:
                                member.last_read_message_id = message_id
                                db.commit()
                            member_ids = [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]
                            await manager.broadcast_to_conversation(conv_id, {"type": "message.read", "payload": {"conversation_id": conv_id, "message_id": message_id, "user_id": user.id}}, member_ids=member_ids)
                elif mtype in ("call.offer", "call.answer", "call.ice_candidate"):
                    # WebRTC signaling relay
                    to_user = payload.get("to_user_id") or payload.get("to") or payload.get("callee_id") or payload.get("caller_id")
                    # Try to infer from callId if not provided
                    if not to_user and payload.get("callId"):
                        try:
                            from app.models.call import CallHistory
                            call = db.query(CallHistory).filter_by(id=int(payload.get("callId"))).first()
                            if call:
                                to_user = call.callee_id if user.id == call.caller_id else call.caller_id
                        except:
                            pass
                    if to_user:
                        try:
                            await manager.send_to_user(int(to_user), {"type": mtype, "payload": {**payload, "from_user_id": user.id}})
                        except:
                            pass
                    else:
                        # Fallback broadcast to conversation if provided
                        conv_id = payload.get("conversation_id")
                        if conv_id:
                            member_ids = [m.user_id for m in db.query(ConversationMember).filter_by(conversation_id=conv_id).all()]
                            await manager.broadcast_to_conversation(conv_id, {"type": mtype, "payload": {**payload, "from_user_id": user.id}}, member_ids=member_ids, exclude_user=user.id)
                else:
                    # unknown type, ignore or echo error
                    await websocket.send_text(json.dumps({"type": "error", "payload": {"message": f"Unknown type {mtype}"}}))
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(websocket, user.id)
            try:
                # set offline if no more connections
                if not manager.is_online(user.id):
                    db2 = SessionLocal()
                    u2 = db2.query(User).filter(User.id == user.id).first()
                    if u2:
                        from datetime import datetime, timezone
                        u2.is_online = False
                        u2.last_seen = datetime.now(timezone.utc)
                        db2.commit()
                    db2.close()
            except:
                pass
    finally:
        db.close()
