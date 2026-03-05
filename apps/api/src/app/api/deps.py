from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.repositories.media_repository import MediaRepository
from app.repositories.post_repository import PostRepository
from app.repositories.tag_repository import TagRepository
from app.services.media_service import MediaService
from app.services.post_service import PostService
from app.services.tag_service import TagService
from app.storage.minio_client import MinioStorageClient


def get_db(db: Session = Depends(get_db_session)) -> Session:
    return db


def get_post_service(db: Session = Depends(get_db)) -> PostService:
    return PostService(repo=PostRepository(db))


def get_media_service(db: Session = Depends(get_db)) -> MediaService:
    storage = MinioStorageClient()
    return MediaService(storage=storage, repo=MediaRepository(db))


def get_tag_service(db: Session = Depends(get_db)) -> TagService:
    return TagService(repo=TagRepository(db))
