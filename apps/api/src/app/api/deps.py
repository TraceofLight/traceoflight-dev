from __future__ import annotations

from functools import lru_cache

from fastapi import Depends
from redis import Redis as SyncRedis
from redis.asyncio import Redis
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.core.config import settings
from app.repositories.admin_credential_repository import AdminCredentialRepository
from app.repositories.media_repository import MediaRepository
from app.repositories.post_repository import PostRepository
from app.repositories.site_profile_repository import SiteProfileRepository
from app.repositories.series_repository import SeriesRepository
from app.repositories.tag_repository import TagRepository
from app.services.admin_auth_service import AdminAuthService
from app.services.import_service import ImportService
from app.services.media_service import MediaService
from app.services.post_comment_service import PostCommentService
from app.services.post_service import PostService
from app.services.post_translation_service import PostTranslationService
from app.services.series_translation_service import SeriesTranslationService
from app.services.project_service import ProjectService
from app.services.resume_service import (
    PORTFOLIO_PDF_CONFIG,
    RESUME_PDF_CONFIG,
    PdfAssetService,
)
from app.services.site_profile_service import SiteProfileService
from app.services.series_service import SeriesService
from app.services.tag_service import TagService
from app.services.translation_queue import TranslationQueue
from app.storage.minio_client import MinioStorageClient


_sync_redis_client: SyncRedis | None = None
_translation_queue: TranslationQueue | None = None


def _get_translation_queue() -> TranslationQueue | None:
    global _sync_redis_client, _translation_queue
    if _translation_queue is not None:
        return _translation_queue
    try:
        _sync_redis_client = SyncRedis.from_url(settings.redis_url)
        # Smoke ping; if Redis isn't reachable, fall back to no queue rather
        # than failing every post-create request.
        _sync_redis_client.ping()
    except Exception:
        return None
    _translation_queue = TranslationQueue(
        connection=_sync_redis_client,
        name=settings.redis_queue_name,
    )
    return _translation_queue


def get_series_translation_service() -> SeriesTranslationService:
    return SeriesTranslationService(queue=_get_translation_queue())


def get_db(db: Session = Depends(get_db_session)) -> Session:
    return db


def get_post_service(db: Session = Depends(get_db)) -> PostService:
    return PostService(
        repo=PostRepository(db),
        translation_service=PostTranslationService(queue=_get_translation_queue()),
    )


def get_post_comment_service(db: Session = Depends(get_db)) -> PostCommentService:
    return PostCommentService(db)


def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    return ProjectService(post_repo=PostRepository(db), series_repo=SeriesRepository(db))


@lru_cache
def get_storage_client() -> MinioStorageClient:
    return MinioStorageClient()


def get_media_service(db: Session = Depends(get_db)) -> MediaService:
    return MediaService(storage=get_storage_client(), repo=MediaRepository(db))


def get_tag_service(db: Session = Depends(get_db)) -> TagService:
    return TagService(repo=TagRepository(db))


def get_series_service(db: Session = Depends(get_db)) -> SeriesService:
    return SeriesService(
        repo=SeriesRepository(db),
        translation_service=get_series_translation_service(),
    )


def get_import_service(db: Session = Depends(get_db)) -> ImportService:
    return ImportService(storage=get_storage_client(), db=db)


def get_portfolio_pdf_service() -> PdfAssetService:
    return PdfAssetService(storage=get_storage_client(), config=PORTFOLIO_PDF_CONFIG)


def get_resume_service() -> PdfAssetService:
    return PdfAssetService(storage=get_storage_client(), config=RESUME_PDF_CONFIG)


def get_site_profile_service(db: Session = Depends(get_db)) -> SiteProfileService:
    return SiteProfileService(repo=SiteProfileRepository(db))


@lru_cache
def get_redis_client() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=False)


def get_admin_auth_service(db: Session = Depends(get_db)) -> AdminAuthService:
    return AdminAuthService(repo=AdminCredentialRepository(db), redis=get_redis_client())
