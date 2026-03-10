from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.media import MediaAsset
from app.models.post import Post
from app.models.series import Series
from app.schemas.imports import BackupLoadRead
from app.services.imports import (
    BackupRestoreCoordinator,
    build_posts_backup_zip,
    extract_internal_object_key,
    extract_markdown_media_object_keys,
    fallback_media_manifest_entry,
    parse_posts_backup_zip,
    to_iso_utc,
    utcnow,
)
from app.services.imports.errors import ImportValidationError
from app.services.series_projection_cache import rebuild_series_projection_cache
from app.storage.minio_client import MinioStorageClient


class ImportService:
    def __init__(
        self,
        storage: MinioStorageClient,
        db: Session | None = None,
    ) -> None:
        self.storage = storage
        self.db = db

    def download_posts_backup(self) -> tuple[str, bytes]:
        if self.db is None:
            raise ImportValidationError("database session is required")

        posts = list(
            self.db.scalars(
                select(Post)
                .options(selectinload(Post.tags))
                .order_by(Post.published_at.asc().nulls_last(), Post.created_at.asc(), Post.slug.asc())
            )
        )
        media_object_keys: set[str] = set()
        for post in posts:
            cover_key = extract_internal_object_key(post.cover_image_url)
            if cover_key is not None:
                media_object_keys.add(cover_key)
            media_object_keys.update(extract_markdown_media_object_keys(post.body_markdown))

        series_rows = list(self.db.scalars(select(Series).where(Series.cover_image_url.is_not(None))))
        series_overrides: list[dict[str, str]] = []
        for series in series_rows:
            if not (series.cover_image_url or "").strip():
                continue
            series_overrides.append(
                {
                    "series_title": series.title,
                    "cover_image_url": series.cover_image_url.strip(),
                }
            )
            cover_key = extract_internal_object_key(series.cover_image_url)
            if cover_key is not None:
                media_object_keys.add(cover_key)

        media_rows = list(
            self.db.scalars(
                select(MediaAsset).where(MediaAsset.object_key.in_(sorted(media_object_keys)))
            )
        )
        media_by_object_key = {row.object_key: row for row in media_rows}
        media_payloads: dict[str, bytes] = {}
        media_manifest: list[dict[str, object]] = []

        for object_key in sorted(media_object_keys):
            try:
                media_payloads[object_key] = self.storage.get_bytes(object_key)
            except Exception as exc:  # pragma: no cover - storage dependent
                raise ImportValidationError(
                    f"failed to read media object for backup: {object_key}"
                ) from exc

            media = media_by_object_key.get(object_key)
            if media is None:
                media_manifest.append(
                    fallback_media_manifest_entry(object_key, media_payloads[object_key])
                )
                continue
            media_manifest.append(
                {
                    "object_key": media.object_key,
                    "kind": media.kind.value,
                    "original_filename": media.original_filename,
                    "mime_type": media.mime_type,
                    "size_bytes": media.size_bytes or len(media_payloads[object_key]),
                    "width": media.width,
                    "height": media.height,
                    "duration_seconds": media.duration_seconds,
                }
            )

        self.storage.ensure_bucket()
        archive_data = build_posts_backup_zip(
            posts=[
                {
                    "slug": post.slug,
                    "title": post.title,
                    "excerpt": post.excerpt,
                    "status": post.status.value,
                    "visibility": post.visibility.value,
                    "published_at": to_iso_utc(post.published_at),
                    "tags": [tag.slug for tag in post.tags],
                    "series_title": post.series_title,
                    "cover_image_url": post.cover_image_url,
                    "body_markdown": post.body_markdown,
                }
                for post in posts
            ],
            media_manifest=media_manifest,
            media_payloads=media_payloads,
            series_overrides=series_overrides,
            generated_at=utcnow(),
        )

        file_name = f"traceoflight-posts-backup-{utcnow().strftime('%Y%m%d-%H%M%S')}.zip"
        return file_name, archive_data

    def load_posts_backup(self, filename: str, data: bytes) -> BackupLoadRead:
        if self.db is None:
            raise ImportValidationError("database session is required")
        if not filename.strip():
            raise ImportValidationError("backup filename is required")
        if not data:
            raise ImportValidationError("backup file is empty")

        parsed = self._parse_posts_backup_zip(data)
        coordinator = BackupRestoreCoordinator(
            storage=self.storage,
            db=self.db,
            rebuild_series_projection=rebuild_series_projection_cache,
        )
        return coordinator.restore(parsed)

    def _parse_posts_backup_zip(self, backup_data: bytes):
        return parse_posts_backup_zip(backup_data)
