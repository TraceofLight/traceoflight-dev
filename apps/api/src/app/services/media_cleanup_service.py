from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.media import MediaAsset
from app.models.post import Post
from app.models.project_profile import ProjectProfile
from app.models.series import Series
from app.services.imports.media_refs import extract_internal_object_key, extract_markdown_media_object_keys


def _normalize_utc_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _collect_referenced_media_object_keys(db: Session) -> set[str]:
    referenced: set[str] = set()

    posts = db.scalars(select(Post)).all()
    for post in posts:
        for raw_value in (
            post.cover_image_url,
            post.top_media_image_url,
            post.top_media_video_url,
        ):
            object_key = extract_internal_object_key(raw_value)
            if object_key:
                referenced.add(object_key)
        referenced.update(extract_markdown_media_object_keys(post.body_markdown or ""))

    profiles = db.scalars(select(ProjectProfile)).all()
    for profile in profiles:
        object_key = extract_internal_object_key(profile.card_image_url)
        if object_key:
            referenced.add(object_key)

    series_rows = db.scalars(select(Series)).all()
    for series in series_rows:
        object_key = extract_internal_object_key(series.cover_image_url)
        if object_key:
            referenced.add(object_key)

    return referenced


def purge_orphaned_media(db: Session, *, storage, retention_days: int) -> int:
    normalized_retention_days = max(1, int(retention_days))
    cutoff = datetime.now(timezone.utc) - timedelta(days=normalized_retention_days)
    referenced_keys = _collect_referenced_media_object_keys(db)
    media_rows = db.scalars(select(MediaAsset)).all()

    deleted_count = 0
    for media in media_rows:
        if media.object_key in referenced_keys:
            continue
        if _normalize_utc_timestamp(media.updated_at) >= cutoff:
            continue

        if storage.object_exists(media.object_key):
            storage.delete_object(media.object_key)

        db.delete(media)
        deleted_count += 1

    if deleted_count > 0:
        db.commit()

    return deleted_count
