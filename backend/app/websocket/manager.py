import json
import asyncio
import logging
from typing import Dict, Set, List, Optional
from fastapi import WebSocket
from collections import defaultdict

logger = logging.getLogger(__name__)


class ConnectionManager:
    # Wave 4B provisional bounds (see WAVE4B_REPORT; conservative, documented,
    # no multi-instance semantics — single-process protection only).
    # Fan-out is chunked so a 5k-member broadcast never holds 5k coroutines
    # at once; small rooms (< chunk) behave exactly as before (one gather).
    FANOUT_CHUNK_SIZE = 100
    # Typing is UI hint, not data: re-broadcast at most one start per
    # (user, conversation) per window; stops are always delivered.
    TYPING_MIN_INTERVAL_S = 3.0
    # Sockets per user: tabs + phone + desktop comfortably fit; beyond this
    # the oldest reconnect loop is almost certainly a runaway client.
    MAX_SOCKETS_PER_USER = 10

    def __init__(self):
        self.user_connections: Dict[int, Set[WebSocket]] = defaultdict(set)
        # sid -> sockets, for session-scoped revocation sweeps (Wave 2).
        # Legacy (pre-session) sockets are tracked with sid None and are
        # only ever closed by user-level sweeps, never session sweeps.
        self.sid_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.socket_sids: Dict[WebSocket, Optional[str]] = {}
        # (user_id, conversation_id) -> last broadcast typing.start epoch.
        # Pruned opportunistically; bounded by concurrently-typing pairs.
        self._typing_last: Dict[tuple, float] = {}
        self.lock = asyncio.Lock()
        self._loop = None

    def set_loop(self, loop) -> None:
        """Main event loop, captured at startup for cross-thread scheduling."""
        self._loop = loop

    def spawn(self, coro) -> None:
        """Fire-and-forget a coroutine from ANY thread.

        Hot HTTP endpoints are sync (threadpool) so slow DB calls can't stall
        the event loop — but plain create_task only works on the loop thread.
        This schedules correctly from both worlds; nothing is ever silently
        dropped except when the server is shutting down.
        """
        try:
            asyncio.get_running_loop().create_task(coro)
            return
        except RuntimeError:
            pass
        if self._loop is not None:
            try:
                asyncio.run_coroutine_threadsafe(coro, self._loop)
                return
            except Exception as e:
                logger.error(f"Background schedule failed: {e}")
                return
        logger.error("No event loop to schedule background task on")

    async def connect(self, websocket: WebSocket, user_id: int, sid: str = None):
        await websocket.accept()
        async with self.lock:
            self.user_connections[user_id].add(websocket)
            self.socket_sids[websocket] = sid
            if sid is not None:
                self.sid_connections[sid].add(websocket)
        await self.broadcast_presence(user_id, True)

    async def disconnect(self, websocket: WebSocket, user_id: int):
        async with self.lock:
            if user_id in self.user_connections:
                self.user_connections[user_id].discard(websocket)
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]
            sid = self.socket_sids.pop(websocket, None)
            if sid is not None and sid in self.sid_connections:
                self.sid_connections[sid].discard(websocket)
                if not self.sid_connections[sid]:
                    del self.sid_connections[sid]
        # Only broadcast offline if no remaining connections
        if user_id not in self.user_connections:
            await self.broadcast_presence(user_id, False)

    async def close_session_sockets(self, sid: str, code: int = 4401) -> int:
        """Close every socket bound to a revoked session (revocation sweep).

        No polling: callers spawn this exactly on revocation events (logout,
        per-device delete, family kill, password events). Returns count.
        """
        async with self.lock:
            targets = list(self.sid_connections.get(sid, set()))
        closed = 0
        for ws in targets:
            try:
                await ws.close(code=code)
                closed += 1
            except Exception:
                pass
        return closed

    async def close_user_sockets(self, user_id: int, code: int = 4401) -> int:
        """Close all of a user's sockets (password reset: all families die)."""
        async with self.lock:
            targets = list(self.user_connections.get(user_id, set()))
        closed = 0
        for ws in targets:
            try:
                await ws.close(code=code)
                closed += 1
            except Exception:
                pass
        return closed

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

    def socket_count(self, user_id: int) -> int:
        return len(self.user_connections.get(user_id, ()))

    def typing_allowed(
        self, user_id: int, conversation_id: int, now: float = None
    ) -> bool:
        """Coalesce typing.start floods; typing.stop always passes (call with
        is_typing=False bypasses). Pure predicate — unit-testable, no I/O."""
        import time as _time

        ts = now if now is not None else _time.time()
        key = (user_id, conversation_id)
        last = self._typing_last.get(key)
        # Opportunistic prune keeps the map bounded by active typers.
        if len(self._typing_last) > 1000:
            cutoff = ts - self.TYPING_MIN_INTERVAL_S * 20
            for k, v in list(self._typing_last.items()):
                if v < cutoff:
                    del self._typing_last[k]
        if last is not None and ts - last < self.TYPING_MIN_INTERVAL_S:
            return False
        self._typing_last[key] = ts
        return True

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
        # Chunked so very large rooms bound in-flight coroutines; rooms under
        # FANOUT_CHUNK_SIZE behave exactly as before (single gather).
        jobs = [
            self.send_to_user(uid, data)
            for uid in targets
            if exclude_user is None or uid != exclude_user
        ]
        if jobs:
            for i in range(0, len(jobs), self.FANOUT_CHUNK_SIZE):
                await asyncio.gather(
                    *jobs[i : i + self.FANOUT_CHUNK_SIZE], return_exceptions=True
                )

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
            # Opted out: stay silent, nobody is told.
            from app.utils.privacy import get_settings

            scope = (
                getattr(get_settings(db, user_id), "online_status_visible", None)
                or "everyone"
            ).lower()
            if scope == "nobody":
                return
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
