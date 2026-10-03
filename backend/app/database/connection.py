from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import sessionmaker, declarative_base
from app.database.config import settings

connect_args = {}
is_sqlite = settings.DATABASE_URL.startswith("sqlite")
if is_sqlite:
    connect_args = {"check_same_thread": False}

# PostgreSQL connection pool settings
engine_kwargs = dict(pool_pre_ping=True)
if not is_sqlite:
    engine_kwargs.update(
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_timeout=settings.DB_POOL_TIMEOUT,
    )

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs,
)

if is_sqlite:
    # Concurrent readers/writers (request handlers + WS fan-out tasks) hit
    # "database is locked" on stock SQLite: WAL lets reads proceed during
    # writes and busy_timeout waits out brief write contention instead of
    # erroring instantly.
    from sqlalchemy import event as _sa_event

    @_sa_event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _conn_record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _is_duplicate_table_error(exc: Exception) -> bool:
    """Return True only for race-safe 'table already exists' failures."""
    orig = getattr(exc, "orig", None)
    if getattr(orig, "pgcode", None) == "42P07":
        return True
    message = str(exc).lower()
    return "already exists" in message and ("relation" in message or "table" in message)


def create_tables():
    try:
        # create_all() is normally check-first, but Render Postgres proved a
        # table can exist while SQLAlchemy still emits CREATE TABLE for it
        # (psycopg2 42P07 DuplicateTable). Create tables one at a time and
        # tolerate only that specific race so boot never dies on it.
        for table in Base.metadata.sorted_tables:
            try:
                table.create(bind=engine, checkfirst=True)
            except (ProgrammingError, OperationalError) as table_exc:
                if _is_duplicate_table_error(table_exc):
                    print(f"[migrate] table exists, skipping {table.name}")
                    continue
                raise
        _ensure_missing_columns()
    except Exception as e:
        print(f"Database table creation failed: {e}")
        raise


def _ensure_missing_columns():
    """Add columns added to models after initial table creation.

    create_all() never alters existing tables, so a column like
    attachments.cloudinary_url would otherwise crash queries on old DBs
    (local sqlite + Render postgres). This is intentionally minimal:
    compare metadata vs inspector and ALTER TABLE ADD COLUMN for gaps.
    """
    try:
        with engine.begin() as conn:
            insp = inspect(conn)
            existing_tables = set(insp.get_table_names())
            for table_name, table in Base.metadata.tables.items():
                if table_name not in existing_tables:
                    continue
                try:
                    db_cols = {c["name"] for c in insp.get_columns(table_name)}
                except Exception:
                    continue
                for col in table.columns:
                    if col.name in db_cols:
                        continue
                    try:
                        coltype = col.type.compile(dialect=engine.dialect)
                        # Never add a bare NOT NULL column: it fails on tables
                        # that already hold rows (SQLite and Postgres alike).
                        # Nullable + app-level default covers it.
                        default = ""
                        if col.server_default is not None:
                            try:
                                default = f" DEFAULT {col.server_default.arg}"
                            except Exception:
                                default = ""
                        conn.exec_driver_sql(
                            f'ALTER TABLE "{table_name}" ADD COLUMN "{col.name}" {coltype}{default}'
                        )
                        print(f"[migrate] added {table_name}.{col.name}")
                    except Exception as col_e:
                        print(f"[migrate] skipped {table_name}.{col.name}: {col_e}")
    except Exception as e:
        print(f"[migrate] column check skipped: {e}")
