"""Wave 4C: WebSocket typing-storm + protection benchmarks on isolated PG.

Single TestClient + ExitStack (multi-portal TestClients cannot share the
app's connection maps). Receiver threads drain on the SAME client.
Stop signaling: set flag, then send one trailing typing.stop (stops are
never coalesced) to unblock each receiver.
"""

import sys
import threading
import time
from contextlib import ExitStack

from common import percentiles, rss_mb, QueryCounter, require_pg_engine

engine, Base = require_pg_engine()
Base.metadata.create_all(engine)

from fastapi.testclient import TestClient  # noqa
import app.main  # noqa
from app.main import app  # noqa
from app.auth.security import hash_password  # noqa
from app.database.connection import SessionLocal  # noqa
from app.models.user import User  # noqa
from app.models.conversation import Conversation, ConversationMember  # noqa
from app.services import auth_sessions as svc  # noqa

PW = hash_password("benchpass123")
counter = QueryCounter(engine)
client = TestClient(app)


def mkusers(n, tag):
    db = SessionLocal()
    try:
        for i in range(n):
            db.add(
                User(
                    username=f"{tag}{i:03d}",
                    email=f"{tag}{i:03d}@bench.test",
                    display_name="W",
                    hashed_password=PW,
                    email_verified=True,
                )
            )
        db.commit()
        return [
            u.id
            for u in db.query(User)
            .filter(User.username.like(f"{tag}%"))
            .order_by(User.id)
            .all()
        ]
    finally:
        db.close()


def mktok(uid):
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=uid).one()
        row, _ = svc.create_session(db, uid)
        return svc.issue_access_token(user, row.id)
    finally:
        db.close()


def storm(room_size, bursts=5, per_burst=10, n_watchers=5):
    tag = f"st{room_size}_{int(time.time() * 1000) % 100000}_"
    uids = mkusers(room_size, tag)
    db = SessionLocal()
    try:
        c = Conversation(is_group=True, title="storm", created_by=uids[0])
        db.add(c)
        db.flush()
        for uid in uids:
            db.add(ConversationMember(conversation_id=c.id, user_id=uid, role="member"))
        db.commit()
        cid = c.id
    finally:
        db.close()
    toks = [mktok(u) for u in uids]
    received = []
    lock = threading.Lock()
    stop = {"flag": False}

    def watcher(ws):
        try:
            while True:
                try:
                    m = ws.receive_json()
                except Exception:
                    break
                if m.get("type") == "typing.start":
                    with lock:
                        received.append(time.perf_counter())
                if stop["flag"]:
                    break
        except Exception:
            pass

    with ExitStack() as st:
        watchers = [
            st.enter_context(client.websocket_connect(f"/ws/chat?token={toks[i]}"))
            for i in range(min(n_watchers, room_size))
        ]
        sender = st.enter_context(client.websocket_connect(f"/ws/chat?token={toks[0]}"))
        threads = [
            threading.Thread(target=watcher, args=(w,), daemon=True) for w in watchers
        ]
        for t in threads:
            t.start()
        time.sleep(1)
        counter.reset()
        t0 = time.perf_counter()
        sent = 0
        for _ in range(bursts):
            for _ in range(per_burst):
                sender.send_json(
                    {"type": "typing.start", "payload": {"conversation_id": cid}}
                )
                sent += 1
            time.sleep(0.2)
        first_recv = None
        deadline = time.time() + 10
        while time.time() < deadline:
            with lock:
                if received:
                    first_recv = received[0]
                    break
            time.sleep(0.1)
        # unblock receivers with an uncoalescable stop each
        stop["flag"] = True
        for _ in watchers:
            try:
                sender.send_json(
                    {"type": "typing.stop", "payload": {"conversation_id": cid}}
                )
            except Exception:
                pass
        for t in threads:
            t.join(timeout=15)
        dt = time.perf_counter() - t0
    with lock:
        n_recv = len(received)
    per_watcher = n_recv / max(1, len(watchers))
    return {
        "room": room_size,
        "watchers": len(watchers),
        "sent": sent,
        "received_per_watcher_avg": round(per_watcher, 1),
        "coalesced_pct": round(100 * (1 - per_watcher / sent), 1) if sent else 0,
        "first_fanout_latency_s": round(first_recv - t0, 4) if first_recv else None,
        "window_s": round(dt, 2),
        "db_queries_during": counter.n,
    }


def latency_probe():
    """Single typing event, send-to-receive wall time (includes TestClient
    portal overhead — an upper bound, not server latency)."""
    tag = f"lat{int(time.time() * 1000) % 100000}_"
    uids = mkusers(2, tag)
    db = SessionLocal()
    try:
        c = Conversation(is_group=True, title="lat", created_by=uids[0])
        db.add(c)
        db.flush()
        for uid in uids:
            db.add(ConversationMember(conversation_id=c.id, user_id=uid, role="member"))
        db.commit()
        cid = c.id
    finally:
        db.close()
    toks = [mktok(u) for u in uids]
    out = {}
    with ExitStack() as st:
        w = st.enter_context(client.websocket_connect(f"/ws/chat?token={toks[1]}"))
        s = st.enter_context(client.websocket_connect(f"/ws/chat?token={toks[0]}"))
        time.sleep(1)
        t0 = time.perf_counter()
        s.send_json({"type": "typing.start", "payload": {"conversation_id": cid}})
        got = None
        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                m = w.receive_json()
            except Exception:
                break
            if m.get("type") == "typing.start":
                got = time.perf_counter() - t0
                break
        out = {"send_to_receive_s": round(got, 4) if got else None}
    return out


def fanout_dispatch_probe():
    """Server-side fan-out dispatch time (no TestClient portal involved):
    N fake member sockets, one broadcast, wall time. Honest dispatch cost."""
    import asyncio
    from app.websocket.manager import ConnectionManager

    results = {}
    for n in (50, 500):
        mgr = ConnectionManager()

        class Fake:
            def __init__(self):
                self.at = None

            async def send_text(self, text):
                import time as _t

                self.at = _t.perf_counter()

        async def go():
            import time as _t

            for uid in range(n):
                mgr.user_connections[uid].add(Fake())
            t0 = _t.perf_counter()
            await mgr.broadcast_to_conversation(
                1, {"type": "typing.start", "payload": {}}, member_ids=list(range(n))
            )
            dt = _t.perf_counter() - t0
            last = max(ws.at for s in mgr.user_connections.values() for ws in s)
            return dt, (last - t0)

        total, last_delivery = asyncio.run(go())
        results[f"members_{n}"] = {
            "gather_wall_s": round(total, 4),
            "last_delivery_s": round(last_delivery, 4),
        }
    return results


def socket_cap():
    uid = mkusers(1, f"cap{int(time.time() * 1000) % 100000}_")[0]
    tok = mktok(uid)
    with ExitStack() as st:
        for _ in range(10):
            st.enter_context(client.websocket_connect(f"/ws/chat?token={tok}"))
        try:
            with client.websocket_connect(f"/ws/chat?token={tok}"):
                return {"cap_11th": "CONNECTED (unexpected)", "pass": False}
        except Exception as e:
            code = getattr(e, "code", None)
            return {"cap_11th": f"rejected code={code}", "pass": code == 1008}


def main():
    import json

    out = {"scenarios": []}
    out["scenarios"].append({"name": "typing/small-room-5", **storm(5)})
    out["scenarios"].append({"name": "typing/medium-room-50", **storm(50)})
    out["scenarios"].append({"name": "fanout-dispatch", **fanout_dispatch_probe()})
    out["scenarios"].append({"name": "socket-cap", **socket_cap()})
    out["rss_mb"] = rss_mb()
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
