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
    # Drop all tables first to ensure clean schema (important after model changes)
    try:
        Base.metadata.drop_all(bind=engine)
    except Exception:
        pass
    # Then create all tables with the current model definitions
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Database table creation error: {e}")
