from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, env_file='.env.api', extra='ignore')

    app_name: str = Field(default='traceoflight-api', alias='APP_NAME')
    app_env: str = Field(default='development', alias='APP_ENV')
    log_level: str = Field(default='INFO', alias='LOG_LEVEL')
    api_prefix: str = Field(default='/api/v1/web-service', alias='API_PREFIX')
    cors_allow_origins: str = Field(
        default='https://traceoflight.dev,https://www.traceoflight.dev,http://localhost:6543',
        alias='CORS_ALLOW_ORIGINS',
    )

    postgres_user: str = Field(default='traceoflight', alias='POSTGRES_USER')
    postgres_password: str = Field(default='traceoflight', alias='POSTGRES_PASSWORD')
    postgres_db: str = Field(default='traceoflight', alias='POSTGRES_DB')
    postgres_host: str = Field(default='localhost', alias='POSTGRES_HOST')
    postgres_port: int = Field(default=5432, alias='POSTGRES_PORT')

    minio_endpoint: str = Field(default='localhost:9000', alias='MINIO_ENDPOINT')
    minio_access_key: str = Field(default='traceoflight', alias='MINIO_ACCESS_KEY')
    minio_secret_key: str = Field(default='traceoflight', alias='MINIO_SECRET_KEY')
    minio_bucket: str = Field(default='traceoflight-media', alias='MINIO_BUCKET')
    minio_secure: bool = Field(default=False, alias='MINIO_SECURE')
    minio_presigned_expire_seconds: int = Field(default=900, alias='MINIO_PRESIGNED_EXPIRE_SECONDS')
    internal_api_secret: str = Field(default='', alias='INTERNAL_API_SECRET')
    admin_login_id: str = Field(default='', alias='ADMIN_LOGIN_ID')
    admin_login_password: str = Field(default='', alias='ADMIN_LOGIN_PASSWORD')
    admin_login_password_hash: str = Field(default='', alias='ADMIN_LOGIN_PASSWORD_HASH')
    admin_session_secret: str = Field(default='', alias='ADMIN_SESSION_SECRET')
    admin_access_token_max_age_seconds: int = Field(default=900, alias='ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS')
    admin_refresh_token_max_age_seconds: int = Field(
        default=1209600,
        alias='ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS',
    )
    redis_url: str = Field(default='redis://localhost:6379/0', alias='REDIS_URL')
    redis_queue_name: str = Field(default='translations', alias='REDIS_QUEUE_NAME')
    deepl_api_key: str | None = Field(default=None, alias='DEEPL_API_KEY')
    draft_retention_days: int = Field(default=7, alias='DRAFT_RETENTION_DAYS')
    media_orphan_retention_days: int = Field(default=7, alias='MEDIA_ORPHAN_RETENTION_DAYS')
    slug_redirect_min_age_days: int = Field(default=90, alias='SLUG_REDIRECT_MIN_AGE_DAYS')
    slug_redirect_idle_days: int = Field(default=30, alias='SLUG_REDIRECT_IDLE_DAYS')
    draft_cleanup_start_hour: int = Field(default=0, alias='DRAFT_CLEANUP_START_HOUR')
    draft_cleanup_end_hour: int = Field(default=5, alias='DRAFT_CLEANUP_END_HOUR')
    series_projection_rebuild_debounce_seconds: float = Field(
        default=1.0,
        alias='SERIES_PROJECTION_REBUILD_DEBOUNCE_SECONDS',
    )
    reading_words_per_minute: int = Field(
        default=200,
        alias='READING_WORDS_PER_MINUTE',
    )
    indexnow_key: str | None = Field(default=None, alias='INDEXNOW_KEY')
    indexnow_host: str | None = Field(default=None, alias='INDEXNOW_HOST')
    indexnow_endpoint: str = Field(
        default='https://api.indexnow.org/indexnow',
        alias='INDEXNOW_ENDPOINT',
    )

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(',') if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
