from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.post import (
    Post,
    PostContentKind,
    PostStatus,
    PostTopMediaKind,
    PostVisibility,
)
from app.services.import_service import ImportService, ImportValidationError


class _StorageStub:
    def __init__(
        self,
        *,
        fail_on_put_number: int | None = None,
        object_bytes: dict[str, bytes] | None = None,
    ) -> None:
        self.bucket = "traceoflight-test"
        self.fail_on_put_number = fail_on_put_number
        self.object_bytes = object_bytes or {}
        self.put_calls: list[str] = []
        self.delete_calls: list[str] = []

    def ensure_bucket(self) -> None:
        return None

    def put_bytes(
        self,
        object_key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        self.put_calls.append(object_key)
        if (
            self.fail_on_put_number is not None
            and len(self.put_calls) == self.fail_on_put_number
        ):
            raise RuntimeError("simulated storage put failure")
        self.object_bytes[object_key] = data

    def get_bytes(self, object_key: str) -> bytes:
        return self.object_bytes[object_key]

    def object_exists(self, object_key: str) -> bool:
        return object_key in self.object_bytes

    def delete_object(self, object_key: str) -> None:
        self.delete_calls.append(object_key)
        self.object_bytes.pop(object_key, None)


def _session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def _seed_post(session, slug: str = "existing-post") -> None:
    session.add(
        Post(
            slug=slug,
            title="Existing post",
            excerpt="existing",
            body_markdown="body",
            cover_image_url=None,
            series_title=None,
            status=PostStatus.PUBLISHED,
            visibility=PostVisibility.PUBLIC,
            published_at=None,
        )
    )
    session.commit()


def test_load_posts_backup_rejects_invalid_archive_before_clearing_posts() -> None:
    session = _session()
    _seed_post(session)
    service = ImportService(
        storage=_StorageStub(),
        db=session,
    )

    with pytest.raises(ImportValidationError):
        service.load_posts_backup("broken.zip", b"not-a-zip")

    assert session.scalar(select(Post).where(Post.slug == "existing-post")) is not None


def test_wipe_clears_all_target_tables_but_preserves_admin_credentials() -> None:
    import uuid
    from sqlalchemy import select
    from app.models.admin_credential import (
        AdminCredential,
        OPERATIONAL_ADMIN_CREDENTIAL_KEY,
    )
    from app.models.media import AssetKind, MediaAsset
    from app.models.post import (
        Post,
        PostLocale,
        PostStatus,
        PostTranslationSourceKind,
        PostTranslationStatus,
        PostVisibility,
    )
    from app.models.post_comment import (
        PostComment,
        PostCommentAuthorType,
        PostCommentStatus,
        PostCommentVisibility,
    )
    from app.models.series import Series, SeriesPost
    from app.models.site_profile import DEFAULT_SITE_PROFILE_KEY, SiteProfile
    from app.models.tag import PostTag, Tag
    from app.services.imports.backup.restore import BackupRestoreCoordinator

    session = _session()

    tag = Tag(slug="py", label="Py")
    session.add(tag)
    session.flush()
    post = Post(
        slug="x",
        title="X",
        body_markdown="b",
        top_media_kind=PostTopMediaKind.IMAGE,
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
    )
    session.add(post)
    session.flush()
    session.add(PostTag(post_id=post.id, tag_id=tag.id))
    series = Series(
        slug="s",
        title="S",
        description="d",
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )
    session.add(series)
    session.flush()
    session.add(SeriesPost(series_id=series.id, post_id=post.id, order_index=1))
    session.add(
        PostComment(
            post_id=post.id,
            author_name="a",
            author_type=PostCommentAuthorType.GUEST,
            visibility=PostCommentVisibility.PUBLIC,
            status=PostCommentStatus.ACTIVE,
            body="hi",
        )
    )
    session.add(
        MediaAsset(
            kind=AssetKind.IMAGE,
            bucket="b",
            object_key="image/x.png",
            original_filename="x.png",
            mime_type="image/png",
            size_bytes=1,
        )
    )
    session.add(
        SiteProfile(
            key=DEFAULT_SITE_PROFILE_KEY, email="x@y.z", github_url="https://gh"
        )
    )
    session.add(
        AdminCredential(
            key=OPERATIONAL_ADMIN_CREDENTIAL_KEY,
            login_id="root",
            password_hash="$2b$12$abc",
            credential_revision=1,
        )
    )
    session.commit()

    BackupRestoreCoordinator._wipe_database_contents(session)
    session.commit()

    assert session.scalar(select(Post)) is None
    assert session.scalar(select(PostTag)) is None
    assert session.scalar(select(Tag)) is None
    assert session.scalar(select(Series)) is None
    assert session.scalar(select(SeriesPost)) is None
    assert session.scalar(select(PostComment)) is None
    assert session.scalar(select(MediaAsset)) is None
    assert session.scalar(select(SiteProfile)) is None
    assert session.scalar(select(AdminCredential)) is not None  # preserved


def test_insert_phase_creates_all_rows_with_preserved_uuids() -> None:
    import uuid
    from datetime import datetime
    from sqlalchemy import select
    from app.models.media import MediaAsset
    from app.models.post import Post
    from app.models.post_comment import PostComment
    from app.models.series import Series, SeriesPost
    from app.models.site_profile import SiteProfile
    from app.models.tag import PostTag, Tag
    from app.services.imports.backup import BackupBundle, PostEntry
    from app.services.imports.backup.restore import BackupRestoreCoordinator

    session = _session()

    post_id = "11111111-1111-1111-1111-111111111111"
    tag_id = "22222222-2222-2222-2222-222222222222"
    series_id = "33333333-3333-3333-3333-333333333333"
    sp_id = "44444444-4444-4444-4444-444444444444"
    media_id = "55555555-5555-5555-5555-555555555555"
    root_id = "66666666-6666-6666-6666-666666666666"
    reply_id = "77777777-7777-7777-7777-777777777777"

    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[{"id": tag_id, "slug": "py", "label": "Py"}],
        post_tags=[{"post_id": post_id, "tag_id": tag_id}],
        media_assets=[
            {
                "id": media_id,
                "kind": "image",
                "bucket": "b",
                "object_key": "image/x.png",
                "original_filename": "x.png",
                "mime_type": "image/png",
                "size_bytes": 1,
                "width": None,
                "height": None,
                "duration_seconds": None,
                "owner_post_id": post_id,
            }
        ],
        media_bytes={},
        posts=[
            PostEntry(
                meta={
                    "id": post_id,
                    "slug": "x",
                    "title": "X",
                    "excerpt": None,
                    "cover_image_url": None,
                    "top_media_kind": "image",
                    "top_media_image_url": None,
                    "top_media_youtube_url": None,
                    "top_media_video_url": None,
                    "project_order_index": None,
                    "series_title": None,
                    "locale": "ko",
                    "translation_group_id": "88888888-8888-8888-8888-888888888888",
                    "source_post_id": None,
                    "translation_status": "source",
                    "translation_source_kind": "manual",
                    "translated_from_hash": None,
                    "content_kind": "blog",
                    "status": "published",
                    "visibility": "public",
                    "published_at": None,
                    "project_profile": None,
                },
                body_markdown="hello",
            )
        ],
        series=[
            {
                "id": series_id,
                "slug": "s",
                "title": "S",
                "description": "d",
                "cover_image_url": None,
                "list_order_index": None,
                "translation_group_id": "99999999-9999-9999-9999-999999999999",
                "locale": "ko",
                "source_series_id": None,
                "translation_status": "source",
                "translation_source_kind": "manual",
                "translated_from_hash": None,
            }
        ],
        series_posts=[
            {"id": sp_id, "series_id": series_id, "post_id": post_id, "order_index": 1}
        ],
        post_comments=[
            # Reply listed BEFORE root to verify two-pass ordering works regardless of input order.
            {
                "id": reply_id,
                "post_id": post_id,
                "root_comment_id": root_id,
                "reply_to_comment_id": root_id,
                "author_name": "Re",
                "author_type": "guest",
                "password_hash": None,
                "visibility": "public",
                "status": "active",
                "body": "reply",
                "deleted_at": None,
                "last_edited_at": None,
                "request_ip_hash": None,
                "user_agent_hash": None,
            },
            {
                "id": root_id,
                "post_id": post_id,
                "root_comment_id": None,
                "reply_to_comment_id": None,
                "author_name": "Root",
                "author_type": "guest",
                "password_hash": None,
                "visibility": "public",
                "status": "active",
                "body": "root",
                "deleted_at": None,
                "last_edited_at": None,
                "request_ip_hash": None,
                "user_agent_hash": None,
            },
        ],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    BackupRestoreCoordinator._insert_database_contents(session, bundle)
    session.commit()

    restored_post = session.scalar(select(Post).where(Post.id == uuid.UUID(post_id)))
    assert restored_post is not None and restored_post.slug == "x"
    media = session.scalar(
        select(MediaAsset).where(MediaAsset.id == uuid.UUID(media_id))
    )
    assert media is not None and media.owner_post_id == uuid.UUID(post_id)
    assert session.scalar(select(Tag).where(Tag.id == uuid.UUID(tag_id))) is not None
    assert session.scalar(select(PostTag)) is not None
    assert (
        session.scalar(select(Series).where(Series.id == uuid.UUID(series_id)))
        is not None
    )
    sp = session.scalar(select(SeriesPost).where(SeriesPost.id == uuid.UUID(sp_id)))
    assert sp is not None and sp.order_index == 1
    root = session.scalar(
        select(PostComment).where(PostComment.id == uuid.UUID(root_id))
    )
    reply = session.scalar(
        select(PostComment).where(PostComment.id == uuid.UUID(reply_id))
    )
    assert root is not None and root.root_comment_id is None
    assert reply is not None and reply.root_comment_id == uuid.UUID(root_id)
    profile = session.scalar(select(SiteProfile))
    assert profile is not None and profile.email == "x@y.z"


def test_restore_replaces_seeded_state_and_promotes_media() -> None:
    import uuid
    from datetime import datetime
    from sqlalchemy import select
    from app.models.post import (
        Post,
        PostContentKind,
        PostLocale,
        PostStatus,
        PostTranslationSourceKind,
        PostTranslationStatus,
        PostVisibility,
    )
    from app.services.imports.backup import (
        BackupBundle,
        PostEntry,
        BackupRestoreCoordinator,
    )

    session = _session()

    # Seed pre-existing post that should be wiped.
    pre = Post(
        slug="old",
        title="old",
        body_markdown="b",
        top_media_kind=PostTopMediaKind.IMAGE,
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
    )
    session.add(pre)
    session.commit()

    storage = _StorageStub()
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[],
        post_tags=[],
        media_assets=[
            {
                "id": "55555555-5555-5555-5555-555555555555",
                "kind": "image",
                "bucket": "b",
                "object_key": "image/cover.png",
                "original_filename": "cover.png",
                "mime_type": "image/png",
                "size_bytes": 5,
                "width": None,
                "height": None,
                "duration_seconds": None,
                "owner_post_id": None,
            }
        ],
        media_bytes={"image/cover.png": b"cover"},
        posts=[
            PostEntry(
                meta={
                    "id": "11111111-1111-1111-1111-111111111111",
                    "slug": "new",
                    "title": "New",
                    "excerpt": None,
                    "cover_image_url": "/media/image/cover.png",
                    "top_media_kind": "image",
                    "top_media_image_url": None,
                    "top_media_youtube_url": None,
                    "top_media_video_url": None,
                    "project_order_index": None,
                    "series_title": None,
                    "locale": "ko",
                    "translation_group_id": "22222222-2222-2222-2222-222222222222",
                    "source_post_id": None,
                    "translation_status": "source",
                    "translation_source_kind": "manual",
                    "translated_from_hash": None,
                    "content_kind": "blog",
                    "status": "published",
                    "visibility": "public",
                    "published_at": None,
                    "project_profile": None,
                },
                body_markdown="hi",
            )
        ],
        series=[],
        series_posts=[],
        post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    coordinator = BackupRestoreCoordinator(storage=storage, db=session)
    result = coordinator.restore(bundle)

    assert result.restored_posts == 1
    assert result.restored_media == 1
    assert session.scalar(select(Post).where(Post.slug == "old")) is None
    assert session.scalar(select(Post).where(Post.slug == "new")) is not None
    assert storage.object_bytes["image/cover.png"] == b"cover"


def test_restore_rolls_back_db_and_media_when_insert_fails(monkeypatch) -> None:
    import uuid
    from datetime import datetime
    from sqlalchemy import select
    from app.models.post import (
        Post,
        PostContentKind,
        PostLocale,
        PostStatus,
        PostTranslationSourceKind,
        PostTranslationStatus,
        PostVisibility,
    )
    from app.services.imports.backup import (
        BackupBundle,
        PostEntry,
        BackupRestoreCoordinator,
    )

    session = _session()
    pre = Post(
        slug="seed",
        title="seed",
        body_markdown="b",
        top_media_kind=PostTopMediaKind.IMAGE,
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
    )
    session.add(pre)
    session.commit()

    storage = _StorageStub(object_bytes={"image/cover.png": b"old-cover"})
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[],
        post_tags=[],
        media_assets=[
            {
                "id": "55555555-5555-5555-5555-555555555555",
                "kind": "image",
                "bucket": "b",
                "object_key": "image/cover.png",
                "original_filename": "cover.png",
                "mime_type": "image/png",
                "size_bytes": 5,
                "width": None,
                "height": None,
                "duration_seconds": None,
                "owner_post_id": None,
            }
        ],
        media_bytes={"image/cover.png": b"new-cover"},
        posts=[
            PostEntry(
                meta={
                    "id": "11111111-1111-1111-1111-111111111111",
                    "slug": "x",
                    "title": "X",
                    "excerpt": None,
                    "cover_image_url": "/media/image/cover.png",
                    "top_media_kind": "image",
                    "top_media_image_url": None,
                    "top_media_youtube_url": None,
                    "top_media_video_url": None,
                    "project_order_index": None,
                    "series_title": None,
                    "locale": "ko",
                    "translation_group_id": "22222222-2222-2222-2222-222222222222",
                    "source_post_id": None,
                    "translation_status": "source",
                    "translation_source_kind": "manual",
                    "translated_from_hash": None,
                    "content_kind": "blog",
                    "status": "published",
                    "visibility": "public",
                    "published_at": None,
                    "project_profile": None,
                },
                body_markdown="hi",
            )
        ],
        series=[],
        series_posts=[],
        post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    coordinator = BackupRestoreCoordinator(storage=storage, db=session)

    def fail_after_promote(*args, **kwargs):
        raise RuntimeError("simulated insert failure")

    monkeypatch.setattr(coordinator, "_insert_database_contents", fail_after_promote)

    import pytest

    with pytest.raises(RuntimeError, match="simulated insert failure"):
        coordinator.restore(bundle)

    assert session.scalar(select(Post).where(Post.slug == "seed")) is not None
    assert storage.object_bytes["image/cover.png"] == b"old-cover"


def test_load_posts_backup_round_trip_through_zip() -> None:
    from datetime import datetime
    from sqlalchemy import select
    from app.models.post import Post
    from app.services.imports.backup import (
        BackupBundle,
        PostEntry,
        build_backup_zip,
    )
    from app.services.import_service import ImportService

    session = _session()
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[],
        post_tags=[],
        media_assets=[],
        media_bytes={},
        posts=[
            PostEntry(
                meta={
                    "id": "11111111-1111-1111-1111-111111111111",
                    "slug": "new",
                    "title": "New",
                    "excerpt": None,
                    "cover_image_url": None,
                    "top_media_kind": "image",
                    "top_media_image_url": None,
                    "top_media_youtube_url": None,
                    "top_media_video_url": None,
                    "project_order_index": None,
                    "series_title": None,
                    "locale": "ko",
                    "translation_group_id": "22222222-2222-2222-2222-222222222222",
                    "source_post_id": None,
                    "translation_status": "source",
                    "translation_source_kind": "manual",
                    "translated_from_hash": None,
                    "content_kind": "blog",
                    "status": "published",
                    "visibility": "public",
                    "published_at": None,
                    "project_profile": None,
                },
                body_markdown="hi",
            )
        ],
        series=[],
        series_posts=[],
        post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )
    zip_bytes = build_backup_zip(bundle)

    service = ImportService(storage=_StorageStub(), db=session)
    result = service.load_posts_backup("backup.zip", zip_bytes)

    assert result.restored_posts == 1
    assert session.scalar(select(Post).where(Post.slug == "new")) is not None


def test_backup_restore_cleanup_runs_when_media_staging_fails_v3() -> None:
    from datetime import timezone
    from sqlalchemy import select
    from app.models.post import Post
    from app.services.imports.backup import (
        BackupBundle,
        BackupRestoreCoordinator,
    )

    session = _session()
    _seed_post(session)
    storage = _StorageStub(fail_on_put_number=2)

    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[],
        post_tags=[],
        media_assets=[
            {
                "id": "55555555-5555-5555-5555-555555555555",
                "kind": "image",
                "bucket": "b",
                "object_key": "image/a.png",
                "original_filename": "a.png",
                "mime_type": "image/png",
                "size_bytes": 1,
                "width": None,
                "height": None,
                "duration_seconds": None,
                "owner_post_id": None,
            },
            {
                "id": "66666666-6666-6666-6666-666666666666",
                "kind": "image",
                "bucket": "b",
                "object_key": "image/b.png",
                "original_filename": "b.png",
                "mime_type": "image/png",
                "size_bytes": 1,
                "width": None,
                "height": None,
                "duration_seconds": None,
                "owner_post_id": None,
            },
        ],
        media_bytes={"image/a.png": b"a", "image/b.png": b"b"},
        posts=[],
        series=[],
        series_posts=[],
        post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )
    coordinator = BackupRestoreCoordinator(storage=storage, db=session)

    import pytest

    with pytest.raises(RuntimeError, match="simulated storage put failure"):
        coordinator.restore(bundle)

    assert any(call.endswith("/image/a.png") for call in storage.delete_calls)
    assert session.scalar(select(Post).where(Post.slug == "existing-post")) is not None


def test_backup_restore_restores_previous_media_objects_when_db_fails_after_promote_v3(
    monkeypatch,
) -> None:
    from datetime import timezone
    from sqlalchemy import select
    from app.models.post import Post
    from app.services.imports.backup import (
        BackupBundle,
        BackupRestoreCoordinator,
    )

    session = _session()
    _seed_post(session)
    storage = _StorageStub(
        object_bytes={
            "image/cover.png": b"old-cover",
            "image/body.png": b"old-body",
        }
    )
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[],
        post_tags=[],
        media_assets=[
            {
                "id": "55555555-5555-5555-5555-555555555555",
                "kind": "image",
                "bucket": "b",
                "object_key": "image/cover.png",
                "original_filename": "cover.png",
                "mime_type": "image/png",
                "size_bytes": 5,
                "width": None,
                "height": None,
                "duration_seconds": None,
                "owner_post_id": None,
            },
            {
                "id": "66666666-6666-6666-6666-666666666666",
                "kind": "image",
                "bucket": "b",
                "object_key": "image/body.png",
                "original_filename": "body.png",
                "mime_type": "image/png",
                "size_bytes": 4,
                "width": None,
                "height": None,
                "duration_seconds": None,
                "owner_post_id": None,
            },
        ],
        media_bytes={"image/cover.png": b"new-cover", "image/body.png": b"new-body"},
        posts=[],
        series=[],
        series_posts=[],
        post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    coordinator = BackupRestoreCoordinator(storage=storage, db=session)

    def fail_after_promote(*args, **kwargs):
        raise RuntimeError("simulated db failure after promote")

    monkeypatch.setattr(coordinator, "_insert_database_contents", fail_after_promote)

    import pytest

    with pytest.raises(RuntimeError, match="simulated db failure after promote"):
        coordinator.restore(bundle)

    assert storage.object_bytes["image/cover.png"] == b"old-cover"
    assert storage.object_bytes["image/body.png"] == b"old-body"
    assert session.scalar(select(Post).where(Post.slug == "existing-post")) is not None


def test_full_roundtrip_seed_download_wipe_load_matches_seed() -> None:
    import uuid
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models.media import AssetKind, MediaAsset
    from app.models.post import (
        Post,
        PostLocale,
        PostStatus,
        PostTranslationSourceKind,
        PostTranslationStatus,
        PostVisibility,
    )
    from app.models.post_comment import (
        PostComment,
        PostCommentAuthorType,
        PostCommentStatus,
        PostCommentVisibility,
    )
    from app.models.series import Series, SeriesPost
    from app.models.site_profile import DEFAULT_SITE_PROFILE_KEY, SiteProfile
    from app.models.tag import PostTag, Tag
    from app.services.import_service import ImportService

    session = _session()
    storage = _StorageStub(object_bytes={"image/cover.png": b"cover-bytes"})

    # Seed a representative state: KO post w/ tag, KO series, comment, site profile.
    site = SiteProfile(
        key=DEFAULT_SITE_PROFILE_KEY, email="x@y.z", github_url="https://gh"
    )
    tag = Tag(slug="py", label="Python")
    session.add(site)
    session.add(tag)
    session.flush()

    post = Post(
        slug="alpha",
        title="Alpha",
        excerpt="s",
        body_markdown="hello",
        cover_image_url="/media/image/cover.png",
        top_media_kind=PostTopMediaKind.IMAGE,
        top_media_image_url=None,
        top_media_youtube_url=None,
        top_media_video_url=None,
        project_order_index=None,
        series_title="S",
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        source_post_id=None,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        translated_from_hash=None,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        published_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
    )
    session.add(post)
    session.flush()
    session.add(PostTag(post_id=post.id, tag_id=tag.id))
    session.add(
        MediaAsset(
            kind=AssetKind.IMAGE,
            bucket="traceoflight-test",
            object_key="image/cover.png",
            original_filename="cover.png",
            mime_type="image/png",
            size_bytes=11,
            owner_post_id=post.id,
        )
    )
    series = Series(
        slug="S",
        title="S",
        description="d",
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )
    session.add(series)
    session.flush()
    session.add(SeriesPost(series_id=series.id, post_id=post.id, order_index=1))
    session.add(
        PostComment(
            post_id=post.id,
            author_name="Hee",
            author_type=PostCommentAuthorType.GUEST,
            visibility=PostCommentVisibility.PUBLIC,
            status=PostCommentStatus.ACTIVE,
            body="hi",
        )
    )
    session.commit()

    seed_post_id = post.id
    seed_series_id = series.id

    # Download.
    service = ImportService(storage=storage, db=session)
    _, payload = service.download_posts_backup()

    # Wipe + restore into a fresh session/storage.
    fresh_session = _session()
    fresh_storage = _StorageStub()
    fresh_service = ImportService(storage=fresh_storage, db=fresh_session)
    fresh_service.load_posts_backup("roundtrip.zip", payload)

    # Query restored state.
    restored_post = fresh_session.scalar(select(Post).where(Post.slug == "alpha"))
    assert restored_post is not None
    assert restored_post.id == seed_post_id, "Post UUID must be preserved"
    assert {tag.slug for tag in restored_post.tags} == {"py"}
    restored_series = fresh_session.scalar(select(Series).where(Series.slug == "S"))
    assert restored_series is not None and restored_series.id == seed_series_id
    sp = fresh_session.scalar(
        select(SeriesPost).where(SeriesPost.series_id == seed_series_id)
    )
    assert sp is not None and sp.post_id == seed_post_id
    assert (
        fresh_session.scalar(
            select(PostComment).where(PostComment.post_id == seed_post_id)
        )
        is not None
    )
    assert fresh_session.scalar(select(SiteProfile)) is not None
    media = fresh_session.scalar(
        select(MediaAsset).where(MediaAsset.object_key == "image/cover.png")
    )
    assert media is not None and media.owner_post_id == seed_post_id
    assert fresh_storage.object_bytes["image/cover.png"] == b"cover-bytes"
