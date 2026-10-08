"""PE-2H: deterministic backend test database.

Root cause fixed here: the suite used to bind the persistent development
SQLite file (``backend/kbchat.db``) because no pytest configuration existed
— no conftest.py, no DB override — so every run accumulated users/messages
and order/count-sensitive tests (e.g. the weekly leaderboard top-50)
eventually failed.

Strategy (per-session temporary SQLite file):
- This module is imported by pytest BEFORE any test module, hence before
  the first ``app.*`` import. Setting ``DATABASE_URL`` here wins over the
  pydantic default (env > default) and over any ``.env`` file, and
  ``app.database.connection`` binds its module-global engine to the temp
  file on first import.
- One fresh DB per pytest run (not per test): the engine is module-global
  and shared by every test module, so per-test DBs would require an engine
  rebuild — far more invasive for no benefit. Intra-run sharing matches
  long-standing suite behavior; cross-run accumulation (the actual bug) is
  eliminated.
- A session-scoped autouse fixture disposes the engine and removes the
  temp directory at session end (best-effort on Windows file locks).
- Production code is untouched; ``backend/kbchat.db`` is never opened by
  the suite (verified by mtime/size comparison in the PE-2H report).
"""

import os
import shutil
import tempfile

_TEST_DIR = tempfile.mkdtemp(prefix="kb_test_db_")
_TEST_DB_PATH = os.path.join(_TEST_DIR, "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"

import pytest  # noqa: E402  (import after env setup is the whole point)


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_db():
    yield
    try:
        from app.database.connection import engine

        engine.dispose()
    except Exception:
        pass
    shutil.rmtree(_TEST_DIR, ignore_errors=True)
