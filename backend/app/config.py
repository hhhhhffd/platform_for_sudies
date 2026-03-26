from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://judgeflow:judgeflow_secret@localhost:5432/judgeflow"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    FRONTEND_URL: str = "http://localhost:3000"
    ALGORITHM: str = "HS256"
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"  # "json" for prod, "console" for dev
    ENV: str = "production"

    class Config:
        env_file = ".env"


settings = Settings()
