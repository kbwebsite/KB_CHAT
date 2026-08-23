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
    import app.models.poll  # noqa
    import app.models.highlight  # noqa
    Base.metadata.create_all(bind=engine)
    # Auto-migrate: add new columns if missing (for existing DBs without migration)
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            # conversation_members: is_pinned, is_archived, muted_until, is_favorite
            for col, coltype in [("is_pinned", "BOOLEAN DEFAULT 0"), ("is_archived", "BOOLEAN DEFAULT 0"), ("muted_until", "TIMESTAMP NULL"), ("is_favorite", "BOOLEAN DEFAULT 0")]:
                try:
                    if engine.dialect.name == "sqlite":
                        result = conn.execute(text("SELECT name FROM pragma_table_info('conversation_members') WHERE name=:col"), {"col": col})
                        if result.fetchone() is None:
                            conn.execute(text(f"ALTER TABLE conversation_members ADD COLUMN {col} {coltype}"))
                            conn.commit()
                    else:
                        conn.execute(text(f"ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS {col} {coltype}"))
                        conn.commit()
                except Exception:
                    pass
            # messages: is_pinned, pinned_at
            for col, coltype in [("is_pinned", "BOOLEAN DEFAULT 0"), ("pinned_at", "TIMESTAMP NULL")]:
                try:
                    if engine.dialect.name == "sqlite":
                        result = conn.execute(text("SELECT name FROM pragma_table_info('messages') WHERE name=:col"), {"col": col})
                        if result.fetchone() is None:
                            conn.execute(text(f"ALTER TABLE messages ADD COLUMN {col} {coltype}"))
                            conn.commit()
                    else:
                        conn.execute(text(f"ALTER TABLE messages ADD COLUMN IF NOT EXISTS {col} {coltype}"))
                        conn.commit()
                except Exception:
                    pass
            # users: status_message, status_expires_at
            for col, coltype in [("status_message", "VARCHAR(100) NULL"), ("status_expires_at", "TIMESTAMP NULL")]:
                try:
                    if engine.dialect.name == "sqlite":
                        result = conn.execute(text("SELECT name FROM pragma_table_info('users') WHERE name=:col"), {"col": col})
                        if result.fetchone() is None:
                            conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {coltype}"))
                            conn.commit()
                    else:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {coltype}"))
                        conn.commit()
                except Exception:
                    pass
            # Status tables exist
            try:
                conn.execute(text("SELECT 1 FROM statuses LIMIT 1"))
            except Exception:
                pass
    except Exception:
        pass
