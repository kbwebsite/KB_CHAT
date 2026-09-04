from sqlalchemy import create_engine, inspect
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

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    try:
        Base.metadata.create_all(bind=engine)
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
                    db_cols = {
                        c["name"] for c in insp.get_columns(table_name)
                    }
                except Exception:
                    continue
                for col in table.columns:
                    if col.name in db_cols:
                        continue
                    coltype = col.type.compile(dialect=engine.dialect)
                    nullable = "" if col.nullable else " NOT NULL"
                    default = ""
                    if col.server_default is not None:
                        try:
                            default = f" DEFAULT {col.server_default.arg}"
                        except Exception:
                            default = ""
                    conn.exec_driver_sql(
                        f'ALTER TABLE "{table_name}" ADD COLUMN "{col.name}" {coltype}{nullable}{default}'
                    )
                    print(f"[migrate] added {table_name}.{col.name}")
    except Exception as e:
        print(f"[migrate] column check skipped: {e}")
