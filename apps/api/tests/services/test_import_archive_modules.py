from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
import io
from zipfile import ZipFile

from app.services.imports.media_refs import (
    extract_internal_object_key,
    extract_markdown_media_object_keys,
    fallback_media_manifest_entry,
)


def test_backup_v3_schema_version_constant_exists() -> None:
    from app.services.imports.backup.schema import BACKUP_SCHEMA_VERSION

    assert BACKUP_SCHEMA_VERSION == "backup-v3"


def test_backup_v3_bundle_dataclass_has_all_entity_lists() -> None:
    from app.services.imports.backup.bundle import BackupBundle, PostEntry

    assert PostEntry.__dataclass_fields__.keys() >= {"meta", "body_markdown"}
    expected_fields = {
        "site_profile",
        "tags",
        "post_tags",
        "media_assets",
        "media_bytes",
        "posts",
        "series",
        "series_posts",
        "post_comments",
        "generated_at",
    }
    assert BackupBundle.__dataclass_fields__.keys() == expected_fields


def test_media_refs_extract_internal_keys_and_build_fallback_manifest_entry() -> None:
    assert extract_internal_object_key(
        " https://www.traceoflight.dev/media/image/foo%20bar.png "
    ) == ("image/foo bar.png")
    assert extract_internal_object_key("/media/video/demo.mp4") == "video/demo.mp4"
    assert extract_internal_object_key("https://example.com/elsewhere/file.txt") is None
    assert extract_markdown_media_object_keys(
        "![img](/media/image/foo.png) [video](https://traceoflight.dev/media/video/demo.mp4)"
    ) == ["image/foo.png", "video/demo.mp4"]
    assert fallback_media_manifest_entry("image/foo.png", b"png") == {
        "object_key": "image/foo.png",
        "kind": "image",
        "original_filename": "foo.png",
        "mime_type": "image/png",
        "size_bytes": 3,
        "width": None,
        "height": None,
        "duration_seconds": None,
    }


def test_site_profile_roundtrip_through_dict() -> None:
    from app.models.site_profile import SiteProfile, DEFAULT_SITE_PROFILE_KEY
    from app.services.imports.backup.serialize import serialize_site_profile
    from app.services.imports.backup.deserialize import deserialize_site_profile

    profile = SiteProfile(
        key=DEFAULT_SITE_PROFILE_KEY,
        email="hi@traceoflight.dev",
        github_url="https://github.com/traceoflight",
    )

    payload = serialize_site_profile(profile)
    restored = deserialize_site_profile(payload)

    assert payload == {
        "key": "default",
        "email": "hi@traceoflight.dev",
        "github_url": "https://github.com/traceoflight",
    }
    assert restored.key == "default"
    assert restored.email == "hi@traceoflight.dev"
    assert restored.github_url == "https://github.com/traceoflight"


def test_deserialize_site_profile_raises_import_validation_error_on_missing_field() -> (
    None
):
    import pytest
    from app.services.imports.backup.deserialize import deserialize_site_profile
    from app.services.imports.errors import ImportValidationError

    with pytest.raises(
        ImportValidationError, match="site_profile payload missing or invalid field"
    ):
        deserialize_site_profile({"key": "default", "email": "x@y.z"})
        # missing github_url


def test_tag_and_post_tag_roundtrip_through_dict() -> None:
    from app.models.tag import PostTag, Tag
    from app.services.imports.backup.serialize import serialize_tag, serialize_post_tag
    from app.services.imports.backup.deserialize import (
        deserialize_tag,
        deserialize_post_tag,
    )

    tag_id = uuid.uuid4()
    post_id = uuid.uuid4()
    tag = Tag(id=tag_id, slug="python", label="Python")
    post_tag = PostTag(post_id=post_id, tag_id=tag_id)

    tag_payload = serialize_tag(tag)
    post_tag_payload = serialize_post_tag(post_tag)

    assert tag_payload == {"id": str(tag_id), "slug": "python", "label": "Python"}
    assert post_tag_payload == {"post_id": str(post_id), "tag_id": str(tag_id)}

    restored_tag = deserialize_tag(tag_payload)
    restored_link = deserialize_post_tag(post_tag_payload)

    assert restored_tag.id == tag_id
    assert restored_tag.slug == "python"
    assert restored_tag.label == "Python"
    assert restored_link.post_id == post_id
    assert restored_link.tag_id == tag_id


def test_deserialize_tag_raises_import_validation_error_on_missing_field() -> None:
    import pytest
    from app.services.imports.backup.deserialize import deserialize_tag
    from app.services.imports.errors import ImportValidationError

    with pytest.raises(
        ImportValidationError, match="tag payload missing or invalid field"
    ):
        deserialize_tag({"id": str(uuid.uuid4()), "slug": "x"})  # missing label


def test_deserialize_tag_raises_import_validation_error_on_malformed_uuid() -> None:
    import pytest
    from app.services.imports.backup.deserialize import deserialize_tag
    from app.services.imports.errors import ImportValidationError

    with pytest.raises(
        ImportValidationError, match="tag payload missing or invalid field"
    ):
        deserialize_tag({"id": "not-a-uuid", "slug": "x", "label": "X"})


def test_deserialize_post_tag_raises_import_validation_error_on_missing_field() -> None:
    import pytest
    from app.services.imports.backup.deserialize import deserialize_post_tag
    from app.services.imports.errors import ImportValidationError

    with pytest.raises(
        ImportValidationError, match="post_tag payload missing or invalid field"
    ):
        deserialize_post_tag({"post_id": str(uuid.uuid4())})  # missing tag_id


def test_media_asset_roundtrip_through_dict() -> None:
    from datetime import timezone
    from app.models.media import AssetKind, MediaAsset
    from app.services.imports.backup.serialize import serialize_media_asset
    from app.services.imports.backup.deserialize import deserialize_media_asset

    media_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    created = datetime(2026, 5, 5, 10, tzinfo=timezone.utc)
    media = MediaAsset(
        id=media_id,
        kind=AssetKind.IMAGE,
        bucket="traceoflight",
        object_key="image/foo.png",
        original_filename="foo.png",
        mime_type="image/png",
        size_bytes=1234,
        width=800,
        height=600,
        duration_seconds=None,
        owner_post_id=owner_id,
        created_at=created,
        updated_at=created,
    )

    payload = serialize_media_asset(media)
    restored = deserialize_media_asset(payload)

    assert payload == {
        "id": str(media_id),
        "kind": "image",
        "bucket": "traceoflight",
        "object_key": "image/foo.png",
        "original_filename": "foo.png",
        "mime_type": "image/png",
        "size_bytes": 1234,
        "width": 800,
        "height": 600,
        "duration_seconds": None,
        "owner_post_id": str(owner_id),
    }
    assert restored.id == media_id
    assert restored.kind == AssetKind.IMAGE
    assert restored.owner_post_id == owner_id
    assert restored.duration_seconds is None


def test_deserialize_media_asset_raises_on_missing_or_invalid_field() -> None:
    import pytest
    from app.services.imports.backup.deserialize import deserialize_media_asset
    from app.services.imports.errors import ImportValidationError

    with pytest.raises(
        ImportValidationError, match="media_asset payload missing or invalid field"
    ):
        deserialize_media_asset({"id": str(uuid.uuid4()), "kind": "image"})


def test_post_roundtrip_through_dict_with_project_profile() -> None:
    from datetime import datetime
    from app.models.post import (
        Post,
        PostContentKind,
        PostLocale,
        PostStatus,
        PostTopMediaKind,
        PostTranslationSourceKind,
        PostTranslationStatus,
        PostVisibility,
    )
    from app.models.project_profile import ProjectProfile
    from app.services.imports.backup.serialize import serialize_post
    from app.services.imports.backup.deserialize import deserialize_post

    post_id = uuid.uuid4()
    profile_id = uuid.uuid4()
    group_id = uuid.uuid4()
    published = datetime(2026, 4, 1, tzinfo=timezone.utc)
    post = Post(
        id=post_id,
        slug="alpha",
        title="Alpha",
        excerpt="summary",
        body_markdown="![cover](/media/image/cover.png)\n\nbody",
        cover_image_url="/media/image/cover.png",
        top_media_kind=PostTopMediaKind.IMAGE,
        top_media_image_url="/media/image/top.png",
        top_media_youtube_url=None,
        top_media_video_url=None,
        project_order_index=3,
        series_title="Series A",
        locale=PostLocale.KO,
        translation_group_id=group_id,
        source_post_id=None,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        translated_from_hash=None,
        content_kind=PostContentKind.PROJECT,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        published_at=published,
    )
    post.project_profile = ProjectProfile(
        id=profile_id,
        period_label="2026.03 - 2026.04",
        role_summary="Lead",
        project_intro="Intro",
        card_image_url="/media/image/card.png",
        highlights_json=["one", "two"],
        resource_links_json=[{"label": "GH", "href": "https://github.com/x"}],
    )

    meta, body = serialize_post(post)

    assert body == "![cover](/media/image/cover.png)\n\nbody"
    assert meta["id"] == str(post_id)
    assert meta["slug"] == "alpha"
    assert meta["locale"] == "ko"
    assert meta["translation_group_id"] == str(group_id)
    assert meta["project_order_index"] == 3
    assert meta["content_kind"] == "project"
    assert meta["top_media_kind"] == "image"
    assert meta["project_profile"] == {
        "id": str(profile_id),
        "period_label": "2026.03 - 2026.04",
        "role_summary": "Lead",
        "project_intro": "Intro",
        "card_image_url": "/media/image/card.png",
        "highlights": ["one", "two"],
        "resource_links": [{"label": "GH", "href": "https://github.com/x"}],
    }
    assert meta["published_at"] == "2026-04-01T00:00:00Z"

    restored = deserialize_post(meta, body)
    assert restored.id == post_id
    assert restored.translation_group_id == group_id
    assert restored.locale == PostLocale.KO
    assert restored.content_kind == PostContentKind.PROJECT
    assert restored.top_media_kind == PostTopMediaKind.IMAGE
    assert restored.project_profile is not None
    assert restored.project_profile.id == profile_id
    assert restored.project_profile.highlights_json == ["one", "two"]
    assert restored.body_markdown == "![cover](/media/image/cover.png)\n\nbody"


def test_post_roundtrip_with_blog_kind_has_no_project_profile() -> None:
    from app.models.post import (
        Post,
        PostContentKind,
        PostLocale,
        PostStatus,
        PostTopMediaKind,
        PostTranslationSourceKind,
        PostTranslationStatus,
        PostVisibility,
    )
    from app.services.imports.backup.serialize import serialize_post
    from app.services.imports.backup.deserialize import deserialize_post

    post = Post(
        id=uuid.uuid4(),
        slug="blog",
        title="Blog",
        excerpt=None,
        body_markdown="hello",
        cover_image_url=None,
        top_media_kind=PostTopMediaKind.IMAGE,
        top_media_image_url=None,
        top_media_youtube_url=None,
        top_media_video_url=None,
        project_order_index=None,
        series_title=None,
        locale=PostLocale.EN,
        translation_group_id=uuid.uuid4(),
        source_post_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
        translated_from_hash="abc",
        content_kind=PostContentKind.BLOG,
        status=PostStatus.DRAFT,
        visibility=PostVisibility.PRIVATE,
        published_at=None,
    )
    meta, body = serialize_post(post)
    assert meta["project_profile"] is None
    assert meta["locale"] == "en"
    assert meta["translation_status"] == "synced"
    restored = deserialize_post(meta, body)
    assert restored.project_profile is None


def test_deserialize_post_raises_on_missing_or_invalid_field() -> None:
    import pytest
    from app.services.imports.backup.deserialize import deserialize_post
    from app.services.imports.errors import ImportValidationError

    with pytest.raises(
        ImportValidationError, match="post payload missing or invalid field"
    ):
        deserialize_post({"id": str(uuid.uuid4()), "slug": "x"}, "body")


def test_series_and_series_post_roundtrip_through_dict() -> None:
    from app.models.post import (
        PostLocale,
        PostTranslationSourceKind,
        PostTranslationStatus,
    )
    from app.models.series import Series, SeriesPost
    from app.services.imports.backup.serialize import (
        serialize_series,
        serialize_series_post,
    )
    from app.services.imports.backup.deserialize import (
        deserialize_series,
        deserialize_series_post,
    )

    series_id = uuid.uuid4()
    group_id = uuid.uuid4()
    series = Series(
        id=series_id,
        slug="series-a",
        title="Series A",
        description="desc",
        cover_image_url="/media/image/series.png",
        list_order_index=2,
        locale=PostLocale.KO,
        translation_group_id=group_id,
        source_series_id=None,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        translated_from_hash=None,
    )
    sp_id = uuid.uuid4()
    post_id = uuid.uuid4()
    sp = SeriesPost(id=sp_id, series_id=series_id, post_id=post_id, order_index=1)

    series_payload = serialize_series(series)
    sp_payload = serialize_series_post(sp)

    assert series_payload == {
        "id": str(series_id),
        "slug": "series-a",
        "title": "Series A",
        "description": "desc",
        "cover_image_url": "/media/image/series.png",
        "list_order_index": 2,
        "locale": "ko",
        "translation_group_id": str(group_id),
        "source_series_id": None,
        "translation_status": "source",
        "translation_source_kind": "manual",
        "translated_from_hash": None,
    }
    assert sp_payload == {
        "id": str(sp_id),
        "series_id": str(series_id),
        "post_id": str(post_id),
        "order_index": 1,
    }

    restored_series = deserialize_series(series_payload)
    restored_sp = deserialize_series_post(sp_payload)

    # Assert ALL restored fields (catch silent bugs in deserialize):
    assert restored_series.id == series_id
    assert restored_series.slug == "series-a"
    assert restored_series.title == "Series A"
    assert restored_series.description == "desc"
    assert restored_series.cover_image_url == "/media/image/series.png"
    assert restored_series.list_order_index == 2
    assert restored_series.locale == PostLocale.KO
    assert restored_series.translation_group_id == group_id
    assert restored_series.source_series_id is None
    assert restored_series.translation_status == PostTranslationStatus.SOURCE
    assert restored_series.translation_source_kind == PostTranslationSourceKind.MANUAL
    assert restored_series.translated_from_hash is None

    assert restored_sp.id == sp_id
    assert restored_sp.series_id == series_id
    assert restored_sp.post_id == post_id
    assert restored_sp.order_index == 1


def test_deserialize_series_raises_on_missing_or_invalid_field() -> None:
    import pytest
    from app.services.imports.backup.deserialize import deserialize_series
    from app.services.imports.errors import ImportValidationError

    with pytest.raises(
        ImportValidationError, match="series payload missing or invalid field"
    ):
        deserialize_series({"id": str(uuid.uuid4()), "slug": "x"})


def test_deserialize_series_post_raises_on_missing_or_invalid_field() -> None:
    import pytest
    from app.services.imports.backup.deserialize import deserialize_series_post
    from app.services.imports.errors import ImportValidationError

    with pytest.raises(
        ImportValidationError, match="series_post payload missing or invalid field"
    ):
        deserialize_series_post({"id": str(uuid.uuid4())})


def test_post_comment_roundtrip_through_dict() -> None:
    from datetime import datetime
    from app.models.post_comment import (
        PostComment,
        PostCommentAuthorType,
        PostCommentStatus,
        PostCommentVisibility,
    )
    from app.services.imports.backup.serialize import serialize_post_comment
    from app.services.imports.backup.deserialize import deserialize_post_comment

    comment_id = uuid.uuid4()
    post_id = uuid.uuid4()
    root_id = uuid.uuid4()
    reply_id = uuid.uuid4()
    last_edited = datetime(2026, 5, 1, 12, tzinfo=timezone.utc)
    comment = PostComment(
        id=comment_id,
        post_id=post_id,
        root_comment_id=root_id,
        reply_to_comment_id=reply_id,
        author_name="Hee",
        author_type=PostCommentAuthorType.GUEST,
        password_hash="$2b$12$abc",
        visibility=PostCommentVisibility.PUBLIC,
        status=PostCommentStatus.ACTIVE,
        body="Hello",
        deleted_at=None,
        last_edited_at=last_edited,
        request_ip_hash="iphash",
        user_agent_hash="uahash",
    )

    payload = serialize_post_comment(comment)
    restored = deserialize_post_comment(payload)

    # Verify exact serialized dict shape:
    assert payload == {
        "id": str(comment_id),
        "post_id": str(post_id),
        "root_comment_id": str(root_id),
        "reply_to_comment_id": str(reply_id),
        "author_name": "Hee",
        "author_type": "guest",
        "password_hash": "$2b$12$abc",
        "visibility": "public",
        "status": "active",
        "body": "Hello",
        "deleted_at": None,
        "last_edited_at": "2026-05-01T12:00:00Z",
        "request_ip_hash": "iphash",
        "user_agent_hash": "uahash",
    }

    # Verify all restored fields:
    assert restored.id == comment_id
    assert restored.post_id == post_id
    assert restored.root_comment_id == root_id
    assert restored.reply_to_comment_id == reply_id
    assert restored.author_name == "Hee"
    assert restored.author_type == PostCommentAuthorType.GUEST
    assert restored.password_hash == "$2b$12$abc"
    assert restored.visibility == PostCommentVisibility.PUBLIC
    assert restored.status == PostCommentStatus.ACTIVE
    assert restored.body == "Hello"
    assert restored.deleted_at is None
    assert restored.last_edited_at is not None and restored.last_edited_at.year == 2026
    assert restored.request_ip_hash == "iphash"
    assert restored.user_agent_hash == "uahash"


def test_post_comment_roundtrip_with_null_self_refs_and_password() -> None:
    """Root comment scenario: no parent, no password, no edits."""
    from app.models.post_comment import (
        PostComment,
        PostCommentAuthorType,
        PostCommentStatus,
        PostCommentVisibility,
    )
    from app.services.imports.backup.serialize import serialize_post_comment
    from app.services.imports.backup.deserialize import deserialize_post_comment

    cid = uuid.uuid4()
    pid = uuid.uuid4()
    comment = PostComment(
        id=cid,
        post_id=pid,
        root_comment_id=None,
        reply_to_comment_id=None,
        author_name="Root",
        author_type=PostCommentAuthorType.ADMIN,
        password_hash=None,
        visibility=PostCommentVisibility.PRIVATE,
        status=PostCommentStatus.DELETED,
        body="x",
        deleted_at=None,
        last_edited_at=None,
        request_ip_hash=None,
        user_agent_hash=None,
    )
    payload = serialize_post_comment(comment)
    assert payload["root_comment_id"] is None
    assert payload["reply_to_comment_id"] is None
    assert payload["password_hash"] is None
    assert payload["author_type"] == "admin"
    assert payload["visibility"] == "private"
    assert payload["status"] == "deleted"

    restored = deserialize_post_comment(payload)
    assert restored.root_comment_id is None
    assert restored.reply_to_comment_id is None
    assert restored.password_hash is None
    assert restored.last_edited_at is None


def test_deserialize_post_comment_raises_on_missing_or_invalid_field() -> None:
    import pytest
    from app.services.imports.backup.deserialize import deserialize_post_comment
    from app.services.imports.errors import ImportValidationError

    with pytest.raises(
        ImportValidationError, match="post_comment payload missing or invalid field"
    ):
        deserialize_post_comment(
            {"id": str(uuid.uuid4()), "post_id": str(uuid.uuid4())}
        )


def test_build_backup_zip_writes_expected_files() -> None:
    from datetime import datetime, timezone
    from app.services.imports.backup import (
        BACKUP_SCHEMA_VERSION,
        BackupBundle,
        PostEntry,
        build_backup_zip,
    )

    group_id = "11111111-1111-1111-1111-111111111111"
    series_group = "22222222-2222-2222-2222-222222222222"
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[{"id": "tag-1", "slug": "py", "label": "Py"}],
        post_tags=[{"post_id": "p1", "tag_id": "tag-1"}],
        media_assets=[
            {
                "id": "m1",
                "kind": "image",
                "bucket": "b",
                "object_key": "image/x.png",
                "original_filename": "x.png",
                "mime_type": "image/png",
                "size_bytes": 3,
                "width": None,
                "height": None,
                "duration_seconds": None,
                "owner_post_id": None,
            }
        ],
        media_bytes={"image/x.png": b"abc"},
        posts=[
            PostEntry(
                meta={
                    "id": "p1",
                    "slug": "alpha",
                    "title": "Alpha",
                    "translation_group_id": group_id,
                    "locale": "ko",
                    "project_profile": None,
                },
                body_markdown="hello",
            )
        ],
        series=[
            {
                "id": "s1",
                "slug": "S",
                "title": "S",
                "description": "d",
                "cover_image_url": None,
                "list_order_index": None,
                "translation_group_id": series_group,
                "locale": "ko",
                "source_series_id": None,
                "translation_status": "source",
                "translation_source_kind": "manual",
                "translated_from_hash": None,
            }
        ],
        series_posts=[
            {"id": "sp1", "series_id": "s1", "post_id": "p1", "order_index": 1}
        ],
        post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    zip_bytes = build_backup_zip(bundle)
    with ZipFile(io.BytesIO(zip_bytes)) as archive:
        names = set(archive.namelist())
        manifest = json.loads(archive.read("manifest.json").decode())
        post_meta = json.loads(archive.read(f"posts/{group_id}/ko/meta.json").decode())
        post_body = archive.read(f"posts/{group_id}/ko/content.md").decode()
        series_payload = json.loads(
            archive.read(f"series/{series_group}/ko.json").decode()
        )
        media_bytes_in_zip = archive.read("media/image/x.png")

    assert manifest["schema_version"] == BACKUP_SCHEMA_VERSION
    assert manifest["counts"] == {
        "posts": 1,
        "series": 1,
        "tags": 1,
        "post_tags": 1,
        "series_posts": 1,
        "post_comments": 0,
        "media_assets": 1,
    }
    assert post_meta["slug"] == "alpha"
    assert post_body == "hello"
    assert series_payload["title"] == "S"
    assert media_bytes_in_zip == b"abc"
    assert "db/site_profile.json" in names
    assert "db/tags.json" in names
    assert "db/post_tags.json" in names
    assert "db/series_posts.json" in names
    assert "db/post_comments.json" in names
    assert "db/media_assets.json" in names


def test_parse_backup_zip_round_trips_through_build() -> None:
    from datetime import timezone
    from app.services.imports.backup import (
        BackupBundle,
        PostEntry,
        build_backup_zip,
        parse_backup_zip,
    )

    group_id = "11111111-1111-1111-1111-111111111111"
    series_group = "22222222-2222-2222-2222-222222222222"
    bundle = BackupBundle(
        site_profile={"key": "default", "email": "x@y.z", "github_url": "https://gh"},
        tags=[],
        post_tags=[],
        media_assets=[],
        media_bytes={},
        posts=[
            PostEntry(
                meta={
                    "id": "p1",
                    "slug": "alpha",
                    "title": "Alpha",
                    "translation_group_id": group_id,
                    "locale": "ko",
                    "series_title": "S",
                    "project_profile": None,
                },
                body_markdown="hello",
            )
        ],
        series=[
            {
                "id": "s1",
                "slug": "S",
                "title": "S",
                "description": "d",
                "cover_image_url": None,
                "list_order_index": None,
                "translation_group_id": series_group,
                "locale": "ko",
                "source_series_id": None,
                "translation_status": "source",
                "translation_source_kind": "manual",
                "translated_from_hash": None,
            }
        ],
        series_posts=[],
        post_comments=[],
        generated_at=datetime(2026, 5, 5, tzinfo=timezone.utc),
    )

    parsed = parse_backup_zip(build_backup_zip(bundle))

    assert len(parsed.posts) == 1
    assert parsed.posts[0].meta["slug"] == "alpha"
    assert parsed.posts[0].body_markdown == "hello"
    assert parsed.site_profile == bundle.site_profile
    assert parsed.series[0]["slug"] == "S"


def test_parse_backup_zip_rejects_dangling_post_tag() -> None:
    import pytest
    from app.services.imports.backup import parse_backup_zip
    from app.services.imports.errors import ImportValidationError

    memory = io.BytesIO()
    with ZipFile(memory, mode="w") as archive:
        archive.writestr(
            "manifest.json",
            json.dumps(
                {
                    "schema_version": "backup-v3",
                    "generated_at": "2026-05-05T00:00:00Z",
                    "counts": {
                        "posts": 0,
                        "series": 0,
                        "tags": 1,
                        "post_tags": 1,
                        "series_posts": 0,
                        "post_comments": 0,
                        "media_assets": 0,
                    },
                }
            ),
        )
        archive.writestr("db/site_profile.json", "null")
        archive.writestr(
            "db/tags.json", json.dumps([{"id": "tag-1", "slug": "x", "label": "X"}])
        )
        archive.writestr(
            "db/post_tags.json",
            json.dumps([{"post_id": "missing-post", "tag_id": "tag-1"}]),
        )
        archive.writestr("db/series_posts.json", "[]")
        archive.writestr("db/post_comments.json", "[]")
        archive.writestr("db/media_assets.json", "[]")

    with pytest.raises(ImportValidationError):
        parse_backup_zip(memory.getvalue())


def test_parse_backup_zip_rejects_unknown_schema_version() -> None:
    import pytest
    from app.services.imports.backup import parse_backup_zip
    from app.services.imports.errors import ImportValidationError

    memory = io.BytesIO()
    with ZipFile(memory, mode="w") as archive:
        archive.writestr(
            "manifest.json",
            json.dumps(
                {
                    "schema_version": "backup-v2",
                    "generated_at": "2026-03-12T00:00:00Z",
                    "post_count": 0,
                    "media_count": 0,
                    "series_override_count": 0,
                    "slugs": [],
                }
            ),
        )

    with pytest.raises(ImportValidationError):
        parse_backup_zip(memory.getvalue())


def test_collect_bundle_reads_full_state_from_session() -> None:
    from datetime import datetime
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.media import AssetKind, MediaAsset
    from app.models.post import (
        Post,
        PostContentKind,
        PostLocale,
        PostStatus,
        PostTopMediaKind,
        PostTranslationSourceKind,
        PostTranslationStatus,
        PostVisibility,
    )
    from app.models.site_profile import DEFAULT_SITE_PROFILE_KEY, SiteProfile
    from app.models.tag import PostTag, Tag
    from app.services.imports.backup import collect_bundle

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()

    session.add(
        SiteProfile(
            key=DEFAULT_SITE_PROFILE_KEY, email="x@y.z", github_url="https://gh"
        )
    )
    tag = Tag(slug="py", label="Python")
    session.add(tag)
    session.flush()

    post = Post(
        slug="alpha",
        title="Alpha",
        excerpt=None,
        body_markdown="![](/media/image/body.png)",
        cover_image_url="/media/image/cover.png",
        top_media_kind=PostTopMediaKind.IMAGE,
        top_media_image_url=None,
        top_media_youtube_url=None,
        top_media_video_url=None,
        project_order_index=None,
        series_title=None,
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
            bucket="b",
            object_key="image/cover.png",
            original_filename="cover.png",
            mime_type="image/png",
            size_bytes=5,
            owner_post_id=post.id,
        )
    )
    session.add(
        MediaAsset(
            kind=AssetKind.IMAGE,
            bucket="b",
            object_key="image/body.png",
            original_filename="body.png",
            mime_type="image/png",
            size_bytes=4,
        )
    )
    session.commit()

    class _Storage:
        bucket = "b"

        def get_bytes(self, key):
            return {"image/cover.png": b"cover", "image/body.png": b"body"}[key]

    bundle = collect_bundle(session, _Storage())

    assert bundle.site_profile["email"] == "x@y.z"
    assert {tag["slug"] for tag in bundle.tags} == {"py"}
    assert len(bundle.post_tags) == 1
    assert len(bundle.posts) == 1
    assert bundle.posts[0].meta["slug"] == "alpha"
    assert bundle.posts[0].body_markdown.startswith("![")
    assert set(bundle.media_bytes.keys()) == {"image/cover.png", "image/body.png"}
    assert {m["object_key"] for m in bundle.media_assets} == {
        "image/cover.png",
        "image/body.png",
    }


def test_collect_bundle_fallback_entry_when_media_asset_row_missing() -> None:
    from datetime import datetime
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.post import (
        Post,
        PostContentKind,
        PostLocale,
        PostStatus,
        PostTopMediaKind,
        PostTranslationSourceKind,
        PostTranslationStatus,
        PostVisibility,
    )
    from app.services.imports.backup import collect_bundle

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()

    post = Post(
        slug="orphan-ref",
        title="x",
        body_markdown="![](/media/image/orphan.png)",  # no MediaAsset row for this
        cover_image_url=None,
        top_media_kind=PostTopMediaKind.IMAGE,
        top_media_image_url=None,
        top_media_youtube_url=None,
        top_media_video_url=None,
        project_order_index=None,
        series_title=None,
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
    session.commit()

    class _Storage:
        bucket = "fallback-bucket"

        def get_bytes(self, key):
            assert key == "image/orphan.png"
            return b"fallback-bytes"

    bundle = collect_bundle(session, _Storage())

    assert len(bundle.media_assets) == 1
    fallback_entry = bundle.media_assets[0]
    assert fallback_entry["object_key"] == "image/orphan.png"
    assert fallback_entry["id"] is None  # no DB row, so id is None
    assert fallback_entry["owner_post_id"] is None
    assert fallback_entry["bucket"] == "fallback-bucket"
    assert fallback_entry["mime_type"] == "image/png"  # inferred from extension
    assert "kind" in fallback_entry
    assert "size_bytes" in fallback_entry
    assert bundle.media_bytes["image/orphan.png"] == b"fallback-bytes"


def test_import_service_download_returns_v3_zip() -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.site_profile import DEFAULT_SITE_PROFILE_KEY, SiteProfile
    from app.services.import_service import ImportService

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    session.add(
        SiteProfile(
            key=DEFAULT_SITE_PROFILE_KEY, email="x@y.z", github_url="https://gh"
        )
    )
    session.commit()

    class _Storage:
        bucket = "b"

        def ensure_bucket(self):
            pass

        def get_bytes(self, key):
            raise KeyError(key)

    service = ImportService(storage=_Storage(), db=session)
    name, payload = service.download_posts_backup()

    assert name.endswith(".zip")
    with ZipFile(io.BytesIO(payload)) as archive:
        manifest = json.loads(archive.read("manifest.json").decode())
    assert manifest["schema_version"] == "backup-v3"
