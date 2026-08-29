import os
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import List

# Compute absolute path for SQLite database relative to this file's location
# This ensures the database path is stable regardless of working directory
_BACKEND_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
_DEFAULT_DB_PATH = os.path.join(_BACKEND_ROOT, "kbchat.db")


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="allow")

    DATABASE_URL: str = f"sqlite:///{_DEFAULT_DB_PATH}"
    JWT_SECRET: str = "dev-secret-change-in-production-please-use-strong-random"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://localhost:3000,https://kb-chat-jqdk.onrender.com"
    )
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 15
    APP_ENV: str = "development"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    AI_API_KEY: str = ""
    AI_MODEL: str = "gpt-4o-mini"
    AI_BASE_URL: str = "https://api.openai.com/v1"
    AI_PROVIDER: str = "mock"
    GOOGLE_CLIENT_ID: str = ""
    TURN_SERVER_URL: str = ""
    TURN_USERNAME: str = ""
    TURN_CREDENTIAL: str = ""
    CLOUDFLARE_TURN_KEY_ID: str = ""
    CLOUDFLARE_TURN_API_TOKEN: str = ""

    def model_post_init(self, __context):
        # Normalize postgres:// -> postgresql:// for SQLAlchemy/psycopg2
        if self.DATABASE_URL and self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgres://", "postgresql://", 1
            )
        # Use env DATABASE_URL if set (e.g., PostgreSQL), otherwise keep SQLite
        if (
            not self.DATABASE_URL
            or self.DATABASE_URL == f"sqlite:///{_DEFAULT_DB_PATH}"
        ):
            self.DATABASE_URL = f"sqlite:///{_DEFAULT_DB_PATH}"
        # Only create directories for SQLite file paths
        if self.DATABASE_URL.startswith("sqlite"):
            db_path = self.DATABASE_URL.replace("sqlite:///", "")
            db_dir = os.path.dirname(db_path)
            if db_dir:
                os.makedirs(db_dir, exist_ok=True)

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def upload_dir_abs(self) -> str:
        if os.path.isabs(self.UPLOAD_DIR):
            return self.UPLOAD_DIR
        base = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        return os.path.join(base, self.UPLOAD_DIR.lstrip("./"))


settings = Settings()
