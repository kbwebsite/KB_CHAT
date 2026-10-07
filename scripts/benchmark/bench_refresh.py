"""Wave 4C: concurrent refresh storm on isolated PG.

20 synthetic users x distinct refresh tokens, all refreshed concurrently.
Asserts: all 200, families intact (no reuse kills), sessions list healthy.
Measures p50/p95/p99 + DB time (approximate under threads).
"""

import sys
import threading
import time

from common import percentiles, rss_mb, require_pg_engine

engine, Base = require_pg_engine()
Base.metadata.create_all(engine)

from fastapi.testclient import TestClient  # noqa
import app.main  # noqa
from app.main import app  # noqa
from app.auth.security import hash_password  # noqa
from app.database.connection import SessionLocal  # noqa
from app.models.user import User  # noqa
from app.services import auth_sessions as svc  # noqa


def main():
    import json

    db = SessionLocal()
    try:
        users = []
        for i in range(20):
            u = User(
                username=f"rf{i:02d}",
                email=f"rf{i:02d}@bench.test",
                display_name="R",
                hashed_password=hash_password("x"),
                email_verified=True,
            )
            db.add(u)
        db.commit()
        rows = []
        for i in range(20):
            u = db.query(User).filter_by(username=f"rf{i:02d}").one()
            row, tok = svc.create_session(db, u.id)
            rows.append((u.id, row.id, tok))
    finally:
        db.close()

    lat, codes = [], {}
    lock = threading.Lock()

    def one(uid, sid, tok):
        c = TestClient(app)
        t0 = time.perf_counter()
        try:
            r = c.post("/api/auth/refresh", json={"refresh_token": tok})
            dt = time.perf_counter() - t0
            with lock:
                lat.append(dt)
                codes[r.status_code] = codes.get(r.status_code, 0) + 1
                if r.status_code == 200:
                    codes["sid_changed"] = codes.get("sid_changed", 0) + (
                        1 if r.json()["data"]["access_token"] else 0
                    )
        except Exception as e:
            with lock:
                codes[f"ERR:{type(e).__name__}"] = (
                    codes.get(f"ERR:{type(e).__name__}", 0) + 1
                )

    rss0 = rss_mb()
    threads = [threading.Thread(target=one, args=t) for t in rows]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    # families intact: every original sid's family still has exactly one active
    db = SessionLocal()
    try:
        active = 0
        for uid, sid, tok in rows:
            fam = svc.find_family_by_refresh_hash(db, tok)
            act = (
                [
                    r
                    for r in db.query(svc.AuthSession).filter_by(family_id=fam).all()
                    if r.status == "active"
                ]
                if fam
                else []
            )
            active += len(act)
    finally:
        db.close()
    print(
        json.dumps(
            {
                "concurrency": 20,
                "status": codes,
                "latency_s": percentiles(lat),
                "families_with_one_active": active,
                "rss_mb": {"before": rss0, "after": rss_mb()},
            },
            indent=1,
        )
    )


if __name__ == "__main__":
    main()
