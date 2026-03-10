from __future__ import annotations

import json
from datetime import datetime, timezone
import io
from zipfile import ZipFile

from app.services.imports.backup_archive import build_posts_backup_zip, parse_posts_backup_zip
from app.services.imports.media_refs import (
    extract_internal_object_key,
    extract_markdown_media_object_keys,
    fallback_media_manifest_entry,
)


def test_media_refs_extract_internal_keys_and_build_fallback_manifest_entry() -> None:
    assert extract_internal_object_key(" https://www.traceoflight.dev/media/image/foo%20bar.png ") == (
        "image/foo bar.png"
    )
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

def test_backup_archive_roundtrip_preserves_posts_media_and_series_overrides() -> None:
    archive_bytes = build_posts_backup_zip(
        posts=[
            {
                "slug": "alpha",
                "title": "Alpha",
                "excerpt": "Summary",
                "status": "published",
                "visibility": "public",
                "published_at": "2026-03-06T00:00:00Z",
                "tags": ["python"],
                "series_title": "Series A",
                "cover_image_url": "/media/image/cover.png",
                "body_markdown": "![cover](/media/image/body.png)",
            }
        ],
        media_manifest=[
            {
                "object_key": "image/body.png",
                "kind": "image",
                "original_filename": "body.png",
                "mime_type": "image/png",
                "size_bytes": 4,
                "width": None,
                "height": None,
                "duration_seconds": None,
            }
        ],
        media_payloads={"image/body.png": b"body"},
        series_overrides=[
            {
                "series_title": "Series A",
                "cover_image_url": "/media/image/series.png",
            }
        ],
        generated_at=datetime(2026, 3, 6, tzinfo=timezone.utc),
    )

    parsed = parse_posts_backup_zip(archive_bytes)

    assert [bundle.slug for bundle in parsed.bundles] == ["alpha"]
    assert parsed.bundles[0].series_title == "Series A"
    assert parsed.media_bytes == {"image/body.png": b"body"}
    assert parsed.series_overrides == [
        {
            "series_title": "Series A",
            "cover_image_url": "/media/image/series.png",
        }
    ]

    with ZipFile(io.BytesIO(archive_bytes)) as archive:
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))

    assert manifest["schema_version"] == "backup-v1"
    assert manifest["slugs"] == ["alpha"]
