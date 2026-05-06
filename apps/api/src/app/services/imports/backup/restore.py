from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.media import MediaAsset
from app.models.post import Post
from app.models.post_comment import PostComment
from app.models.project_profile import ProjectProfile
from app.models.series import Series, SeriesPost
from app.models.site_profile import SiteProfile
from app.models.tag import PostTag, Tag
from app.schemas.imports import BackupLoadRead
from app.services.imports.backup.bundle import BackupBundle
from app.services.imports.backup.deserialize import (
    deserialize_media_asset,
    deserialize_post,
    deserialize_post_comment,
    deserialize_post_tag,
    deserialize_series,
    deserialize_series_post,
    deserialize_site_profile,
    deserialize_tag,
)


class BackupRestoreCoordinator:
    def __init__(self, *, storage, db: Session) -> None:
        self.storage = storage
        self.db = db

    def restore(self, bundle: BackupBundle) -> BackupLoadRead:
        staged_keys = self._stage_media_payloads(bundle)
        previous_objects = self._snapshot_existing_final_objects(bundle)
        try:
            self._promote_staged_media(bundle, staged_keys)
            try:
                with self.db.begin():
                    self._wipe_database_contents(self.db)
                    self._insert_database_contents(self.db, bundle)
            except Exception:
                self._rollback_promoted_media(bundle, previous_objects)
                raise
            self.db.expire_all()
            return BackupLoadRead(
                restored_posts=len(bundle.posts),
                restored_media=len(bundle.media_assets),
                restored_series_overrides=0,
            )
        finally:
            self._cleanup_staged_media(staged_keys.values())

    def _stage_media_payloads(self, bundle: BackupBundle) -> dict[str, str]:
        self.storage.ensure_bucket()
        stage_id = uuid.uuid4().hex
        staged_keys: dict[str, str] = {}
        try:
            for object_key, payload in bundle.media_bytes.items():
                staged_key = f"imports/backups/staging/{stage_id}/{object_key}"
                mime_type = next(
                    (
                        str(m["mime_type"])
                        for m in bundle.media_assets
                        if str(m["object_key"]) == object_key
                    ),
                    "application/octet-stream",
                )
                self.storage.put_bytes(
                    object_key=staged_key,
                    data=payload,
                    content_type=mime_type,
                )
                staged_keys[object_key] = staged_key
        except Exception:
            self._cleanup_staged_media(staged_keys.values())
            raise
        return staged_keys

    def _snapshot_existing_final_objects(
        self,
        bundle: BackupBundle,
    ) -> dict[str, bytes | None]:
        previous_objects: dict[str, bytes | None] = {}
        for object_key in bundle.media_bytes:
            previous_objects[object_key] = (
                self.storage.get_bytes(object_key)
                if self.storage.object_exists(object_key)
                else None
            )
        return previous_objects

    def _promote_staged_media(
        self,
        bundle: BackupBundle,
        staged_keys: dict[str, str],
    ) -> None:
        for object_key, staged_key in staged_keys.items():
            mime_type = next(
                (
                    str(m["mime_type"])
                    for m in bundle.media_assets
                    if str(m["object_key"]) == object_key
                ),
                "application/octet-stream",
            )
            self.storage.put_bytes(
                object_key=object_key,
                data=self.storage.get_bytes(staged_key),
                content_type=mime_type,
            )

    def _rollback_promoted_media(
        self,
        bundle: BackupBundle,
        previous_objects: dict[str, bytes | None],
    ) -> None:
        for object_key, previous_bytes in previous_objects.items():
            mime_type = next(
                (
                    str(m["mime_type"])
                    for m in bundle.media_assets
                    if str(m["object_key"]) == object_key
                ),
                "application/octet-stream",
            )
            if previous_bytes is None:
                self.storage.delete_object(object_key)
                continue
            self.storage.put_bytes(
                object_key=object_key,
                data=previous_bytes,
                content_type=mime_type,
            )

    def _cleanup_staged_media(self, staged_keys: Iterable[str]) -> None:
        for staged_key in staged_keys:
            try:
                self.storage.delete_object(staged_key)
            except Exception:
                continue

    @staticmethod
    def _wipe_database_contents(db: Session) -> None:
        db.execute(delete(PostComment))
        db.execute(delete(SeriesPost))
        db.execute(delete(PostTag))
        db.execute(delete(ProjectProfile))
        db.execute(delete(Post))
        db.execute(delete(Series))
        db.execute(delete(Tag))
        db.execute(delete(MediaAsset))
        db.execute(delete(SiteProfile))

    @staticmethod
    def _insert_database_contents(db: Session, bundle: BackupBundle) -> None:
        with db.no_autoflush:
            for tag_payload in bundle.tags:
                db.add(deserialize_tag(tag_payload))

            for entry in bundle.posts:
                db.add(deserialize_post(entry.meta, entry.body_markdown))
            db.flush()

            for media_payload in bundle.media_assets:
                db.add(deserialize_media_asset(media_payload))

            for link_payload in bundle.post_tags:
                db.add(deserialize_post_tag(link_payload))

            for series_payload in bundle.series:
                db.add(deserialize_series(series_payload))
            db.flush()

            for sp_payload in bundle.series_posts:
                db.add(deserialize_series_post(sp_payload))

            roots = [
                payload
                for payload in bundle.post_comments
                if payload.get("root_comment_id") in (None, payload["id"])
            ]
            replies = [
                payload
                for payload in bundle.post_comments
                if payload.get("root_comment_id") not in (None, payload["id"])
            ]
            for payload in roots:
                db.add(deserialize_post_comment(payload))
            db.flush()
            for payload in replies:
                db.add(deserialize_post_comment(payload))

            if bundle.site_profile is not None:
                db.add(deserialize_site_profile(bundle.site_profile))
