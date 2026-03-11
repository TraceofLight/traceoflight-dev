from __future__ import annotations

from collections.abc import Callable, Iterable
import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.media import MediaAsset
from app.models.post import Post, PostContentKind, PostStatus, PostTopMediaKind, PostVisibility
from app.models.project_profile import ProjectProfile
from app.models.series import Series
from app.repositories.post_repository import PostRepository
from app.schemas.imports import BackupLoadRead
from app.services.series_projection_cache import rebuild_series_projection_cache
from app.storage.minio_client import MinioStorageClient

from .backup_archive import ParsedPostsBackup
from .media_refs import guess_asset_kind
from .models import parse_datetime


def _normalize_series_title(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class BackupRestoreCoordinator:
    def __init__(
        self,
        *,
        storage: MinioStorageClient,
        db: Session,
        rebuild_series_projection: Callable[[], object] = rebuild_series_projection_cache,
    ) -> None:
        self.storage = storage
        self.db = db
        self.rebuild_series_projection = rebuild_series_projection

    def restore(self, parsed: ParsedPostsBackup) -> BackupLoadRead:
        staged_keys = self._stage_media_payloads(parsed)
        previous_objects = self._snapshot_existing_final_objects(parsed)
        try:
            self._promote_staged_media(parsed, staged_keys)
            try:
                with self.db.begin():
                    restored_posts = self._replace_database_contents(parsed)
            except Exception:
                self._rollback_promoted_media(parsed, previous_objects)
                raise
            self.rebuild_series_projection()
            self.db.expire_all()
            overrides_applied = self._apply_series_cover_overrides(parsed.series_overrides)
            return BackupLoadRead(
                restored_posts=restored_posts,
                restored_media=len(parsed.media_manifest),
                restored_series_overrides=overrides_applied,
            )
        finally:
            self._cleanup_staged_media(staged_keys.values())

    def _stage_media_payloads(self, parsed: ParsedPostsBackup) -> dict[str, str]:
        self.storage.ensure_bucket()
        stage_id = uuid.uuid4().hex
        staged_keys: dict[str, str] = {}
        try:
            for media in parsed.media_manifest:
                object_key = str(media["object_key"])
                staged_key = f"imports/backups/staging/{stage_id}/{object_key}"
                self.storage.put_bytes(
                    object_key=staged_key,
                    data=parsed.media_bytes[object_key],
                    content_type=str(media["mime_type"]),
                )
                staged_keys[object_key] = staged_key
        except Exception:
            self._cleanup_staged_media(staged_keys.values())
            raise
        return staged_keys

    def _snapshot_existing_final_objects(
        self,
        parsed: ParsedPostsBackup,
    ) -> dict[str, bytes | None]:
        previous_objects: dict[str, bytes | None] = {}
        for media in parsed.media_manifest:
            object_key = str(media["object_key"])
            if self.storage.object_exists(object_key):
                previous_objects[object_key] = self.storage.get_bytes(object_key)
                continue
            previous_objects[object_key] = None
        return previous_objects

    def _promote_staged_media(
        self,
        parsed: ParsedPostsBackup,
        staged_keys: dict[str, str],
    ) -> None:
        for media in parsed.media_manifest:
            object_key = str(media["object_key"])
            staged_key = staged_keys[object_key]
            self.storage.put_bytes(
                object_key=object_key,
                data=self.storage.get_bytes(staged_key),
                content_type=str(media["mime_type"]),
            )

    def _rollback_promoted_media(
        self,
        parsed: ParsedPostsBackup,
        previous_objects: dict[str, bytes | None],
    ) -> None:
        for media in parsed.media_manifest:
            object_key = str(media["object_key"])
            previous_bytes = previous_objects.get(object_key)
            if previous_bytes is None:
                self.storage.delete_object(object_key)
                continue
            self.storage.put_bytes(
                object_key=object_key,
                data=previous_bytes,
                content_type=str(media["mime_type"]),
            )

    def _cleanup_staged_media(self, staged_keys: Iterable[str]) -> None:
        for staged_key in staged_keys:
            try:
                self.storage.delete_object(staged_key)
            except Exception:
                continue

    def _replace_database_contents(self, parsed: ParsedPostsBackup) -> int:
        self.db.execute(delete(MediaAsset))
        self.db.execute(delete(Post))

        for media in parsed.media_manifest:
            self.db.add(
                MediaAsset(
                    kind=guess_asset_kind(str(media["object_key"]), str(media["mime_type"])),
                    bucket=self.storage.bucket,
                    object_key=str(media["object_key"]),
                    original_filename=str(media["original_filename"]),
                    mime_type=str(media["mime_type"]),
                    size_bytes=int(media["size_bytes"]),
                    width=media.get("width"),
                    height=media.get("height"),
                    duration_seconds=media.get("duration_seconds"),
                    owner_post_id=None,
                )
            )

        repo = PostRepository(self.db)
        restored_posts = 0
        for bundle in parsed.bundles:
            post = Post(
                slug=bundle.slug,
                title=bundle.title,
                excerpt=bundle.excerpt,
                body_markdown=bundle.body_markdown,
                cover_image_url=bundle.cover_image_url,
                top_media_kind=_parse_top_media_kind(bundle.top_media_kind),
                top_media_image_url=bundle.top_media_image_url,
                top_media_youtube_url=bundle.top_media_youtube_url,
                top_media_video_url=bundle.top_media_video_url,
                series_title=_normalize_series_title(bundle.series_title),
                content_kind=PostContentKind.PROJECT
                if bundle.content_kind == "project"
                else PostContentKind.BLOG,
                status=PostStatus.DRAFT if bundle.status == "draft" else PostStatus.PUBLISHED,
                visibility=PostVisibility.PRIVATE
                if bundle.visibility == "private"
                else PostVisibility.PUBLIC,
                published_at=parse_datetime(bundle.published_at),
            )
            if post.content_kind == PostContentKind.PROJECT and isinstance(bundle.project_profile, dict):
                post.project_profile = ProjectProfile(
                    period_label=str(bundle.project_profile["period_label"]),
                    role_summary=str(bundle.project_profile["role_summary"]),
                    project_intro=str(bundle.project_profile["project_intro"]).strip()
                    if bundle.project_profile.get("project_intro")
                    else None,
                    card_image_url=str(bundle.project_profile["card_image_url"]),
                    highlights_json=list(bundle.project_profile.get("highlights") or []),
                    resource_links_json=list(bundle.project_profile.get("resource_links") or []),
                )
            post.tags = repo._resolve_tags(bundle.tags)
            self.db.add(post)
            restored_posts += 1

        return restored_posts

    def _apply_series_cover_overrides(self, series_overrides: list[object]) -> int:
        applied = 0
        with self.db.begin():
            for item in series_overrides:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("series_title", "")).strip()
                cover_image_url = str(item.get("cover_image_url", "")).strip()
                if not title or not cover_image_url:
                    continue
                series = self.db.scalar(select(Series).where(Series.title == title))
                if series is None:
                    continue
                series.cover_image_url = cover_image_url
                applied += 1
        return applied


def _parse_top_media_kind(value: str) -> PostTopMediaKind:
    normalized = value.strip().lower()
    if normalized == "youtube":
        return PostTopMediaKind.YOUTUBE
    if normalized == "video":
        return PostTopMediaKind.VIDEO
    return PostTopMediaKind.IMAGE
