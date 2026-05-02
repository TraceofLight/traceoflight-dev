from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import io
import json
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from .errors import ImportValidationError
from .models import SnapshotBundle, normalize_slug, normalize_tags, to_iso_utc

BACKUP_SCHEMA_VERSION = "backup-v2"
LEGACY_BACKUP_SCHEMA_VERSION = "backup-v1"


@dataclass
class ParsedPostsBackup:
    bundles: list[SnapshotBundle]
    media_manifest: list[dict[str, object]]
    media_bytes: dict[str, bytes]
    series_overrides: list[object]


def build_posts_backup_zip(
    *,
    posts: list[dict[str, object]],
    media_manifest: list[dict[str, object]],
    media_payloads: dict[str, bytes],
    series_overrides: list[dict[str, str]],
    generated_at: datetime,
) -> bytes:
    manifest = {
        "schema_version": BACKUP_SCHEMA_VERSION,
        "generated_at": to_iso_utc(generated_at),
        "post_count": len(posts),
        "media_count": len(media_manifest),
        "series_override_count": len(series_overrides),
        "slugs": [str(post["slug"]) for post in posts],
    }

    memory = io.BytesIO()
    with ZipFile(memory, mode="w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr(
            "media-manifest.json",
            json.dumps(media_manifest, ensure_ascii=False, indent=2),
        )
        archive.writestr(
            "series_overrides.json",
            json.dumps(series_overrides, ensure_ascii=False, indent=2),
        )

        for post in posts:
            base_path = f"posts/{post['slug']}"
            archive.writestr(
                f"{base_path}/meta.json",
                json.dumps(
                    {
                        "slug": post["slug"],
                        "title": post["title"],
                        "excerpt": post.get("excerpt"),
                        "content_kind": post.get("content_kind", "blog"),
                        "status": post["status"],
                        "visibility": post["visibility"],
                        "published_at": post.get("published_at"),
                        "tags": post.get("tags", []),
                        "series_title": post.get("series_title"),
                        "cover_image_url": post.get("cover_image_url"),
                        "top_media_kind": post.get("top_media_kind", "image"),
                        "top_media_image_url": post.get("top_media_image_url"),
                        "top_media_youtube_url": post.get("top_media_youtube_url"),
                        "top_media_video_url": post.get("top_media_video_url"),
                        "project_profile": post.get("project_profile"),
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )
            archive.writestr(f"{base_path}/content.md", str(post["body_markdown"]))

        for media in media_manifest:
            object_key = str(media["object_key"])
            archive.writestr(f"media/{object_key}", media_payloads[object_key])

    return memory.getvalue()


def parse_posts_backup_zip(backup_data: bytes) -> ParsedPostsBackup:
    try:
        archive = ZipFile(io.BytesIO(backup_data))
    except (BadZipFile, OSError) as exc:
        raise ImportValidationError("backup zip is invalid") from exc

    with archive:
        try:
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            media_manifest = json.loads(archive.read("media-manifest.json").decode("utf-8"))
            series_overrides = json.loads(archive.read("series_overrides.json").decode("utf-8"))
        except KeyError as exc:
            raise ImportValidationError("backup archive is incomplete") from exc
        except ValueError as exc:
            raise ImportValidationError("backup archive metadata is invalid") from exc

        if not isinstance(manifest, dict):
            raise ImportValidationError("backup manifest schema is invalid")
        schema_version = str(manifest.get("schema_version", "")).strip()
        if schema_version not in {BACKUP_SCHEMA_VERSION, LEGACY_BACKUP_SCHEMA_VERSION}:
            raise ImportValidationError("backup manifest schema is invalid")
        slugs = manifest.get("slugs")
        if not isinstance(slugs, list):
            raise ImportValidationError("backup manifest slugs are invalid")
        if not isinstance(media_manifest, list):
            raise ImportValidationError("backup media manifest is invalid")
        if not isinstance(series_overrides, list):
            raise ImportValidationError("backup series overrides are invalid")

        media_bytes: dict[str, bytes] = {}
        normalized_media_manifest: list[dict[str, object]] = []
        for item in media_manifest:
            if not isinstance(item, dict):
                raise ImportValidationError("backup media manifest entry is invalid")
            object_key = str(item.get("object_key", "")).strip()
            mime_type = str(item.get("mime_type", "")).strip()
            if not object_key or not mime_type:
                raise ImportValidationError("backup media manifest entry is invalid")
            try:
                media_bytes[object_key] = archive.read(f"media/{object_key}")
            except KeyError as exc:
                raise ImportValidationError(
                    f"backup media payload is missing for object key: {object_key}"
                ) from exc
            normalized_media_manifest.append(
                {
                    "object_key": object_key,
                    "kind": str(item.get("kind", "")),
                    "original_filename": str(item.get("original_filename", "")).strip()
                    or object_key.rsplit("/", 1)[-1],
                    "mime_type": mime_type,
                    "size_bytes": int(
                        item.get("size_bytes", len(media_bytes[object_key]))
                        or len(media_bytes[object_key])
                    ),
                    "width": item.get("width"),
                    "height": item.get("height"),
                    "duration_seconds": item.get("duration_seconds"),
                }
            )

        bundles: list[SnapshotBundle] = []
        for raw_slug in slugs:
            slug = str(raw_slug).strip()
            if not slug:
                continue
            base_path = f"posts/{slug}"
            try:
                meta = json.loads(archive.read(f"{base_path}/meta.json").decode("utf-8"))
                body_markdown = archive.read(f"{base_path}/content.md").decode("utf-8")
            except KeyError as exc:
                raise ImportValidationError(f"backup post entry for {slug} is incomplete") from exc
            except ValueError as exc:
                raise ImportValidationError(f"backup post meta for {slug} is invalid") from exc

            if not isinstance(meta, dict):
                raise ImportValidationError(f"backup post meta for {slug} is invalid")

            title = str(meta.get("title", "")).strip() or slug
            raw_project_profile = meta.get("project_profile")
            project_profile = raw_project_profile if isinstance(raw_project_profile, dict) else None
            bundles.append(
                SnapshotBundle(
                    external_post_id=f"backup-{slug}",
                    external_slug=slug,
                    source_url=f"/blog/{slug}",
                    slug=normalize_slug(str(meta.get("slug", slug)), title),
                    title=title,
                    excerpt=str(meta.get("excerpt")).strip()
                    if isinstance(meta.get("excerpt"), str)
                    else None,
                    body_markdown=body_markdown,
                    cover_image_url=str(meta.get("cover_image_url")).strip()
                    if isinstance(meta.get("cover_image_url"), str)
                    else None,
                    status="draft"
                    if str(meta.get("status", "published")).strip().lower() == "draft"
                    else "published",
                    visibility="private"
                    if str(meta.get("visibility", "public")).strip().lower() == "private"
                    else "public",
                    published_at=str(meta.get("published_at")).strip()
                    if isinstance(meta.get("published_at"), str)
                    else None,
                    tags=normalize_tags(meta.get("tags")),
                    series_title=str(meta.get("series_title")).strip()
                    if isinstance(meta.get("series_title"), str)
                    else None,
                    order_key=str(meta.get("published_at")).strip()
                    if isinstance(meta.get("published_at"), str)
                    else slug,
                    content_kind="project"
                    if str(meta.get("content_kind", "blog")).strip().lower() == "project"
                    else "blog",
                    top_media_kind=_normalize_top_media_kind(meta.get("top_media_kind")),
                    top_media_image_url=str(meta.get("top_media_image_url")).strip()
                    if isinstance(meta.get("top_media_image_url"), str)
                    else None,
                    top_media_youtube_url=str(meta.get("top_media_youtube_url")).strip()
                    if isinstance(meta.get("top_media_youtube_url"), str)
                    else None,
                    top_media_video_url=str(meta.get("top_media_video_url")).strip()
                    if isinstance(meta.get("top_media_video_url"), str)
                    else None,
                    project_profile=_normalize_project_profile(project_profile),
                )
            )

    bundles.sort(key=lambda item: (item.order_key, item.external_post_id))
    return ParsedPostsBackup(
        bundles=bundles,
        media_manifest=normalized_media_manifest,
        media_bytes=media_bytes,
        series_overrides=series_overrides,
    )


def _normalize_top_media_kind(raw: object) -> str:
    value = str(raw or "image").strip().lower()
    if value in {"youtube", "video"}:
        return value
    return "image"


def _normalize_project_profile(raw: dict[str, object] | None) -> dict[str, object] | None:
    if raw is None:
        return None

    period_label = str(raw.get("period_label", "")).strip()
    role_summary = str(raw.get("role_summary", "")).strip()
    card_image_url = str(raw.get("card_image_url", "")).strip()
    if not period_label or not role_summary or not card_image_url:
        return None

    raw_highlights = raw.get("highlights")
    highlights: list[str] = []
    if isinstance(raw_highlights, list):
        highlights = [str(item).strip() for item in raw_highlights if str(item).strip()]
    resource_links: list[dict[str, str]] = []
    raw_links = raw.get("resource_links")
    if isinstance(raw_links, list):
        for item in raw_links:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).strip()
            href = str(item.get("href", "")).strip()
            if not label or not href:
                continue
            resource_links.append({"label": label, "href": href})

    project_intro = str(raw.get("project_intro", "")).strip() or None
    return {
        "period_label": period_label,
        "role_summary": role_summary,
        "project_intro": project_intro,
        "card_image_url": card_image_url,
        "highlights": highlights,
        "resource_links": resource_links,
    }
