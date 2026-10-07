"""Wave 4C benchmark harness — shared helpers (measurement only).

Isolation: every script here MUST run with DATABASE_URL pointing at the
disposable benchmark Postgres (never dev sqlite, never prod). The helpers
refuse to run when the engine dialect is not postgresql.
"""

import os
import statistics
import sys
import time

BENCH_PG_URL_FILE = r"C:\Users\krish\AppData\Local\Temp\opencode\pgbench\bench_uri.txt"


def bench_pg_url() -> str:
    url = os.environ.get("BENCH_PG_URL")
    if url:
        return url.strip()
    with open(BENCH_PG_URL_FILE) as f:
        return f.read().strip()


def percentiles(samples: list) -> dict:
    s = sorted(samples)
    if not s:
        return {"n": 0}

    def pct(p):
        k = (len(s) - 1) * p / 100
        lo, hi = int(k), min(int(k) + 1, len(s) - 1)
        return s[lo] + (s[hi] - s[lo]) * (k - lo)

    return {
        "n": len(s),
        "min": round(min(s), 4),
        "p50": round(pct(50), 4),
        "p95": round(pct(95), 4),
        "p99": round(pct(99), 4),
        "max": round(max(s), 4),
    }


def rss_mb() -> float:
    try:
        import psutil

        return round(psutil.Process().memory_info().rss / 1024 / 1024, 2)
    except Exception:
        return -1.0


class QueryCounter:
    """Counts statements + DB time on the app engine (sequential runs only)."""

    def __init__(self, engine):
        from sqlalchemy import event

        self.engine = engine
        self.n = 0
        self.t = 0.0
        self._b = lambda conn, cursor, statement, params, ctx, xm: setattr(
            ctx, "_bt0", time.perf_counter()
        )
        self._a = lambda conn, cursor, statement, params, ctx, xm: (
            setattr(self, "n", self.n + 1),
            setattr(self, "t", self.t + time.perf_counter() - ctx._bt0),
        )
        event.listen(engine, "before_cursor_execute", self._b)
        event.listen(engine, "after_cursor_execute", self._a)

    def reset(self):
        self.n = 0
        self.t = 0.0

    def remove(self):
        from sqlalchemy import event

        event.remove(self.engine, "before_cursor_execute", self._b)
        event.remove(self.engine, "after_cursor_execute", self._a)


def require_pg_engine():
    """Import the app bound to benchmark PG. MUST be called before any
    app.database import in the process (engine binds at import time)."""
    url = bench_pg_url()
    os.environ["DATABASE_URL"] = url
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
    from app.database.connection import engine, Base  # noqa
    import app.main  # noqa: full table registration

    if engine.dialect.name != "postgresql":
        raise SystemExit(f"REFUSING: engine is {engine.dialect.name}, not postgresql")
    return engine, Base
