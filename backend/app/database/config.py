import os
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Always use SQLite by default to avoid PostgreSQL schema compatibility issues
    # on Render. Override DATABASE_URL env var only if you specifically need PostgreSQL.
    DATABASE_URL: str = "sqlite:///./kbchat.db"
    JWT_SECRET: str = "dev-secret-change-in-production-please-use-strong-random"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 15
    APP_ENV: str = "development"
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    class Config:
        env_file = ".env"
        extra = "allow"

    def model_post_init(self, __context):
        # Default to SQLite for maximum reliability.
        # Set DATABASE_URL=postgresql://... in Render env only if you explicitly need PostgreSQL.
        pass

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def upload_dir_abs(self) -> str:
        # ensure absolute
        if os.path.isabs(self.UPLOAD_DIR):
            return self.UPLOAD_DIR
        # backend/app/database/config.py -> backend/
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(base, self.UPLOAD_DIR.lstrip("./"))

settings = Settings()