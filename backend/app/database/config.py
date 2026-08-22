import os
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
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
