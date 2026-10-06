"""Apply or roll back Wave 3B FK-constraint migrations (explicit only).

Usage (from repo root):
    python scripts/apply_fk_migrations.py [--direction up|down] [--database-url ...]

- Defaults to the configured DATABASE_URL (env override supported).
- Refuses non-Postgres dialects with a clear skip (SQLite needs nothing:
  constraints are unenforced there and new tables already carry correct DDL).
- NOT wired into app boot: run it deliberately in staging, then prod deploy.
- Exit codes: 0 all requested state reached (incl. already-applied),
  2 migration failure, 3 skipped (non-Postgres).
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import create_engine

from app.database.fk_migrations import (
    MigrationError,
    SkippedMigration,
    apply_migrations,
    run_orphan_scans,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--direction", choices=["up", "down"], default="up")
    parser.add_argument("--database-url", default=None)
    parser.add_argument(
        "--scan-only",
        action="store_true",
        help="run orphan scans and exit (no DDL)",
    )
    args = parser.parse_args()

    url = args.database_url or os.environ.get("DATABASE_URL")
    if not url:
        from app.database.config import settings

        url = settings.DATABASE_URL
    engine = create_engine(url)
    sql_dir = os.path.join(
        os.path.dirname(__file__), "..", "backend", "app", "database", "fk_migrations"
    )

    if args.scan_only:
        with engine.begin() as conn:
            scans = run_orphan_scans(conn)
        failed = False
        for label, count in scans.items():
            status = "OK" if not count else "ORPHANS"
            print(f"[{status}] {label}: {count}")
            failed = failed or bool(count)
        return 0 if not failed else 2

    try:
        report = apply_migrations(engine, sql_dir, direction=args.direction)
    except SkippedMigration as e:
        print(f"SKIPPED: {e}")
        return 3
    except MigrationError as e:
        print(f"FAILED: {e}")
        return 2
    for mid, outcome in report.items():
        print(f"{mid}: {outcome}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
