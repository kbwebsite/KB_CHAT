"""Wave 4C: API benchmarks (export / status / search) on isolated PG.

Usage: python scripts/benchmark/bench_api.py [S|M]
Sequential single-client latency + query counts + sizes + RSS.
Concurrency is covered by bench_ws.py / bench_refresh.py.
"""

import hashlib
import sys
import time
from datetime import datetime, timedelta, timezone

from common import percentiles, rss_mb, QueryCounter, require_pg_engine

DATASET = sys.argv[1] if len(sys.argv) > 1 else "S"

engine, Base = require_pg_engine()
Base.metadata.create_all(engine)

from fastapi.testclient import TestClient  # noqa
import app.main  # noqa (ensures routes; engine already bound)
from app.main import app  # noqa
from app.database.connection import SessionLocal  # noqa
from app.models.user import User  # noqa
from app.models.verification import VerificationCode  # noqa

counter = QueryCounter(engine)
client = TestClient(app)


def login(username, password="benchpass123"):
    jar = TestClient(app)
    r = jar.post("/api/auth/login", json={"identifier": username, "password": password})
    assert r.status_code == 200, r.text[:200]
    data = r.json()["data"]
    if "access_token" not in data:
        email = data["email"]
        db = SessionLocal()
        try:
            user = db.query(User).filter_by(email=email).first()
            db.query(VerificationCode).filter_by(
                code_hash=hashlib.sha256(b"123456").hexdigest()
            ).delete()
            db.add(
                VerificationCode(
                    user_id=user.id,
                    email=email,
                    code_hash=hashlib.sha256(b"123456").hexdigest(),
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
                )
            )
            db.commit()
        finally:
            db.close()
        r = jar.post("/api/auth/verify-login", json={"email": email, "code": "123456"})
        data = r.json()["data"]
    return data["access_token"], jar


def run(name, fn, iterations=10, warmup=2):
    for _ in range(warmup):
        try:
            fn()
        except Exception:
            pass
    lat, sizes, qs, qts, codes = [], [], [], [], {}
    rss0 = rss_mb()
    peak = rss0
    for _ in range(iterations):
        counter.reset()
        t0 = time.perf_counter()
        try:
            r = fn()
            dt = time.perf_counter() - t0
            codes[r.status_code] = codes.get(r.status_code, 0) + 1
            if r.status_code < 500:
                lat.append(dt)
                sizes.append(len(r.content))
                qs.append(counter.n)
                qts.append(round(counter.t, 4))
        except Exception as e:
            codes[f"ERR:{type(e).__name__}"] = (
                codes.get(f"ERR:{type(e).__name__}", 0) + 1
            )
        peak = max(peak, rss_mb())
    return {
        "scenario": name,
        "iterations": iterations,
        "status": codes,
        "latency_s": percentiles(lat),
        "bytes": {
            "median": sorted(sizes)[len(sizes) // 2] if sizes else 0,
            "max": max(sizes) if sizes else 0,
        },
        "db_queries": {
            "median": sorted(qs)[len(qs) // 2] if qs else 0,
            "max": max(qs) if qs else 0,
        },
        "db_time_s": {
            "median": sorted(qts)[len(qts) // 2] if qts else 0,
            "max": max(qts) if qts else 0,
        },
        "rss_mb": {"before": rss0, "peak": peak, "after": rss_mb()},
    }


def main():
    import json

    tag = "s" if DATASET == "S" else "m"
    access, jar = login(f"{tag}u0000")
    H = {"Authorization": f"Bearer {access}"}
    db = SessionLocal()
    try:
        from app.models.conversation import Conversation

        big = (
            db.query(Conversation)
            .filter(
                Conversation.title.like(f"{tag}-big" if tag == "m" else "s-group-0")
            )
            .first()
        )
        big_id = big.id if big else None
    finally:
        db.close()

    out = {"dataset": DATASET, "scenarios": []}
    if big_id:
        out["scenarios"].append(
            run(
                "export/default",
                lambda: jar.get(f"/api/conversations/{big_id}/export", headers=H),
                iterations=3,
                warmup=1,
            )
        )
        out["scenarios"].append(
            run(
                "export/limit=100",
                lambda: jar.get(
                    f"/api/conversations/{big_id}/export?limit=100", headers=H
                ),
                iterations=5,
                warmup=1,
            )
        )
        out["scenarios"].append(
            run(
                "export/limit=max",
                lambda: jar.get(
                    f"/api/conversations/{big_id}/export?limit=5000", headers=H
                ),
                iterations=3,
                warmup=1,
            )
        )
        out["scenarios"].append(
            run(
                "export/above-max",
                lambda: jar.get(
                    f"/api/conversations/{big_id}/export?limit=99999", headers=H
                ),
                iterations=3,
                warmup=0,
            )
        )
    out["scenarios"].append(
        run(
            "status/feed",
            lambda: jar.get("/api/status/feed", headers=H),
            iterations=15,
            warmup=2,
        )
    )
    out["scenarios"].append(
        run(
            "status/feed-limit=10",
            lambda: jar.get("/api/status/feed?limit=10", headers=H),
            iterations=15,
            warmup=2,
        )
    )
    for term in ("msg", "big", "zzz-no-hit"):
        out["scenarios"].append(
            run(
                f"search/{term}",
                lambda t=term: jar.get(f"/api/messages/search?q={t}", headers=H),
                iterations=15,
                warmup=2,
            )
        )
    out["scenarios"].append(
        run(
            "users/search",
            lambda: jar.get(f"/api/users/search?q={tag}u00", headers=H),
            iterations=15,
            warmup=2,
        )
    )
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
