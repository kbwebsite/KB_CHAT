import json
import asyncio
from typing import Dict, Set, List
from fastapi import WebSocket
from collections import defaultdict

class ConnectionManager:
    def __init__(self):
        # user_id -> set of websockets
        self.user_connections: Dict[int, Set[WebSocket]] = defaultdict(set)
        # conversation_id -> set of user_ids (for quick broadcast)
        self.conversation_members: Dict[int, Set[int]] = defaultdict(set)
        # presence: user_id -> bool online
        self.online_users: Dict[int, bool] = {}
        # typing: conversation_id -> set of user_ids typing
        self.typing_users: Dict[int, Set[int]] = defaultdict(set)
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        async with self.lock:
            self.user_connections[user_id].add(websocket)
            self.online_users[user_id] = True
        # broadcast presence
        await self.broadcast_presence(user_id, True)

    async def disconnect(self, websocket: WebSocket, user_id: int):
        async with self.lock:
            if user_id in self.user_connections:
                self.user_connections[user_id].discard(websocket)
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]
                    self.online_users.pop(user_id, None)
        await self.broadcast_presence(user_id, False)

    async def send_to_user(self, user_id: int, data: dict):
        conns = list(self.user_connections.get(user_id, []))
        dead = []
        for ws in conns:
            try:
                await ws.send_text(json.dumps(data))
            except:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws, user_id)

    async def broadcast_to_conversation(self, conversation_id: int, data: dict, exclude_user: int = None, member_ids: List[int] = None):
        # if member_ids provided use them, else fallback to all online users logic via direct broadcast
        targets = member_ids if member_ids is not None else list(self.online_users.keys())
        for uid in targets:
            if exclude_user is not None and uid == exclude_user:
                continue
            await self.send_to_user(uid, data)

    async def broadcast_presence(self, user_id: int, is_online: bool):
        payload = {
            "type": "presence.online" if is_online else "presence.offline",
            "payload": {"user_id": user_id, "is_online": is_online}
        }
        # Only notify users who share a conversation with this user (not ALL users)
        member_convs = set(self.conversation_members.keys())
        notified = set()
        for uid in list(self.user_connections.keys()):
            if uid == user_id or uid in notified:
                continue
            # Check if they share any conversation
            for conv_id, members in self.conversation_members.items():
                if user_id in members and uid in members:
                    await self.send_to_user(uid, payload)
                    notified.add(uid)
                    break

    async def send_typing(self, conversation_id: int, user_id: int, is_typing: bool, member_ids: List[int]):
        typ = "typing.start" if is_typing else "typing.stop"
        payload = {
            "type": typ,
            "payload": {"conversation_id": conversation_id, "user_id": user_id}
        }
        for uid in member_ids:
            if uid == user_id:
                continue
            await self.send_to_user(uid, payload)

    def is_online(self, user_id: int) -> bool:
        return user_id in self.user_connections

    def get_online_user_ids(self):
        return list(self.user_connections.keys())

manager = ConnectionManager()
