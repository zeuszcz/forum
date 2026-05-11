from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- App ---
    app_env: Literal["development", "staging", "production"] = "development"
    app_name: str = "endless-war"
    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"

    # --- Security ---
    secret_key: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    cors_origins: str = "http://localhost:3000"

    # --- Postgres ---
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_host: str = "postgres"
    postgres_port: int = 5432

    # --- Redis ---
    redis_url: str = "redis://redis:6379/0"

    # --- MinIO ---
    minio_endpoint: str = "minio:9000"
    minio_public_endpoint: str = "http://localhost:9000"
    minio_access_key: str
    minio_secret_key: str
    minio_bucket: str = "endlesswar"
    minio_secure: bool = False

    # --- Steam (optional in dev) ---
    steam_api_key: str = ""
    steam_realm: str = "http://localhost:8000"
    steam_return_url: str = "http://localhost:8000/auth/steam/callback"

    # --- Email ---
    email_provider: Literal["resend", "postmark", "smtp", "console"] = "console"
    email_from: str = "noreply@endless-war.local"
    resend_api_key: str = ""

    # --- CS 1.6 jail server (shoutbox Phase 3) ---
    # Address the chat header + /connect button advertises. Set to the real
    # public IP:PORT once the jail server is online.
    cs_server_address: str = "ew-jail.innertalk.space:27015"
    cs_server_name: str = "endless-war jail · #1"
    # Bearer-style token expected in X-Shoutbox-Token on POST /shoutbox/system.
    # If empty, the system endpoint is disabled. Generate with `openssl rand -hex 32`.
    shoutbox_system_token: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
