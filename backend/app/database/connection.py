from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker, declarative_base
from app.database.config import settings

connect_args = {}
is_sqlite = settings.DATABASE_URL.startswith("sqlite")
if is_sqlite:
    connect_args = {"check_same_thread": False}

# Postgres pool sizing: Supabase free tier is small; use modest pool
engine_kwargs = dict(pool_pre_ping=True)
if not is_sqlite:
    # for Supabase / Postgres with pgbouncer, disable statement cache issues
    engine_kwargs.update(
        pool_size=5, max_overflow=10, pool_recycle=300, pool_timeout=30
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
    except Exception as e:
        print(f"Database table creation failed: {e}")
        raise
