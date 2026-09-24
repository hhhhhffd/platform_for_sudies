import base64
import binascii

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    ORGANIZER_TOTP_SECRET: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    FRONTEND_URL: str = "http://localhost:3000"
    ALGORITHM: str = "HS256"
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"  # "json" for prod, "console" for dev
    ENV: str = "production"
    UPLOAD_DIR: str = "uploads"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        if len(value.encode()) < 32:
            raise ValueError("SECRET_KEY must contain at least 32 bytes")
        return value

    @field_validator("ORGANIZER_TOTP_SECRET")
    @classmethod
    def validate_totp_secret(cls, value: str) -> str:
        try:
            decoded = base64.b32decode(value, casefold=True)
        except binascii.Error as exc:
            raise ValueError("ORGANIZER_TOTP_SECRET must be a base32 key") from exc
        if len(decoded) < 20:
            raise ValueError("ORGANIZER_TOTP_SECRET must contain at least 160 bits")
        return value.upper()

    class Config:
        env_file = ".env"


settings = Settings()
