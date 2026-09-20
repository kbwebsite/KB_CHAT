import json
import asyncio
import logging
from typing import Dict, Set, List, Optional
from fastapi import WebSocket
from collections import defaultdict

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.user_connections: Dict[int, Set[WebSocket]] = defaultdict(set)
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        async with self.lock:
            self.user_connections[user_id].add(websocket)
        await self.broadcast_presence(user_id, True)

    async def disconnect(self, websocket: WebSocket, user_id: int):
        async with self.lock:
            if user_id in self.user_connections:
                self.user_connections[user_id].discard(websocket)
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]
        # Only broadcast offline if no remaining connections
        if user_id not in self.user_connections:
            await self.broadcast_presence(user_id, False)

    async def send_to_user(self, user_id: int, data: dict):
        conns = list(self.user_connections.get(user_id, []))
        if not conns:
            return
        text = json.dumps(data)
        dead = []
        for ws in conns:
            try:
                # Half-dead (e.g. mobile-network) sockets can block a send for
                # tens of seconds on TCP retransmits — never let one zombie
                # stall the whole fan-out; reap it and move on.
                await asyncio.wait_for(ws.send_text(text), timeout=5)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws, user_id)

    async def broadcast_to_conversation(
        self,
        conversation_id: int,
        data: dict,
        exclude_user: int = None,
        member_ids: List[int] = None,
    ):
        targets = (
            member_ids
            if member_ids is not None
            else await self._get_conversation_members(conversation_id)
        )
        # Parallel fan-out: members were awaited one-by-one, so a single
        # slow (or half-dead) socket delayed delivery to everyone after it.
        jobs = [
            self.send_to_user(uid, data)
            for uid in targets
            if exclude_user is None or uid != exclude_user
        ]
        if jobs:
            await asyncio.gather(*jobs, return_exceptions=True)

    async def _get_conversation_members(self, conversation_id: int) -> List[int]:
        from app.database.connection import SessionLocal
        from app.models.conversation import ConversationMember

        db = SessionLocal()
        try:
            members = (
                db.query(ConversationMember.user_id)
                .filter_by(conversation_id=conversation_id)
                .all()
            )
            return [m[0] for m in members]
        except Exception as e:
            logger.error(f"Failed to get conversation members: {e}")
            return []
        finally:
            db.close()

    async def broadcast_presence(self, user_id: int, is_online: bool):
        from app.database.connection import SessionLocal
        from app.models.conversation import ConversationMember

        payload = {
            "type": "presence.online" if is_online else "presence.offline",
            "payload": {"user_id": user_id, "is_online": is_online},
        }
        db = SessionLocal()
        try:
            conv_ids = [
                c[0]
                for c in db.query(ConversationMember.conversation_id)
                .filter_by(user_id=user_id)
                .all()
            ]
            if not conv_ids:
                return
            # One query for all co-members (was one query per conversation).
            member_rows = (
                db.query(ConversationMember.user_id)
                .filter(
                    ConversationMember.conversation_id.in_(conv_ids),
                    ConversationMember.user_id != user_id,
                )
                .distinct()
                .all()
            )
            member_ids = [m[0] for m in member_rows]
            jobs = [self.send_to_user(uid, payload) for uid in member_ids]
            if jobs:
                await asyncio.gather(*jobs, return_exceptions=True)
        except Exception as e:
            logger.error(f"Failed to broadcast presence: {e}")
        finally:
            db.close()

    async def send_typing(
        self, conversation_id: int, user_id: int, is_typing: bool, member_ids: List[int]
    ):
        typ = "typing.start" if is_typing else "typing.stop"
        payload = {
            "type": typ,
            "payload": {"conversation_id": conversation_id, "user_id": user_id},
        }
        jobs = [self.send_to_user(uid, payload) for uid in member_ids if uid != user_id]
        if jobs:
            await asyncio.gather(*jobs, return_exceptions=True)

    def is_online(self, user_id: int) -> bool:
        return user_id in self.user_connections

    def get_online_user_ids(self):
        return list(self.user_connections.keys())


manager = ConnectionManager()
