from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.database.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
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
    # import all models to ensure they are registered
    import app.models.user  # noqa
    import app.models.conversation  # noqa
    import app.models.message  # noqa
    import app.models.settings  # noqa
    import app.models.saved  # noqa
    import app.models.call  # noqa
    import app.models.status  # noqa
    Base.metadata.create_all(bind=engine)
    # Auto-migrate: add new columns if missing (for existing DBs without migration)
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            # SQLite and Postgres both support adding columns; check existing columns first
            for col, coltype in [("is_pinned", "BOOLEAN DEFAULT 0"), ("is_archived", "BOOLEAN DEFAULT 0")]:
                try:
                    # Try to add column; ignore if exists
                    if engine.dialect.name == "sqlite":
                        # SQLite: check pragma table_info
                        result = conn.execute(text("SELECT name FROM pragma_table_info('conversation_members') WHERE name=:col"), {"col": col})
                        if result.fetchone() is None:
                            conn.execute(text(f"ALTER TABLE conversation_members ADD COLUMN {col} {coltype}"))
                            conn.commit()
                    else:
                        conn.execute(text(f"ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS {col} {coltype}"))
                        conn.commit()
                except Exception:
                    pass
            # Status tables
            try:
                conn.execute(text("SELECT 1 FROM statuses LIMIT 1"))
            except Exception:
                pass
    except Exception:
        pass
