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
    Base.metadata.create_all(bind=engine)
