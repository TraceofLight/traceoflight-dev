from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import io
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen
import uuid
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.models.media import AssetKind, MediaAsset
from app.models.post import Post, PostStatus, PostVisibility
from app.models.series import Series
from app.schemas.imports import (
    BackupLoadRead,
    ImportJobStatus,
    ImportMode,
    SnapshotCreateRead,
    SnapshotImportErrorItem,
    SnapshotImportRunRead,
    SnapshotStatus,
    SourceProvider,
)
from app.schemas.post import PostCreate
from app.services.post_service import PostService
from app.services.series_projection_cache import rebuild_series_projection_cache
from app.storage.minio_client import MinioStorageClient

VELOG_GRAPHQL_URL = "https://v2.velog.io/graphql"
SNAPSHOT_OBJECT_PREFIX = "imports/snapshots"
VELOG_POSTS_PAGE_SIZE = 50
MEDIA_URL_PATH_PREFIX = "/media/"
BACKUP_SCHEMA_VERSION = "backup-v1"

POSTS_QUERY = """
query Posts($username: String, $limit: Int, $cursor: ID) {
  posts(username: $username, limit: $limit, cursor: $cursor) {
    id
    title
    short_description
    thumbnail
    url_slug
    released_at
    updated_at
    is_private
    is_temp
    tags
    series {
      id
      name
    }
  }
}
""".strip()

POST_DETAIL_QUERY = """
query ReadPost($username: String, $url_slug: String) {
  post(username: $username, url_slug: $url_slug) {
    id
    body
  }
}
""".strip()


class ImportServiceError(Exception):
    """Base class for import flow failures."""


class ImportValidationError(ImportServiceError):
    """Raised when payload or snapshot format is invalid."""


class ImportSourceError(ImportServiceError):
    """Raised when external source fetch fails."""


class SnapshotNotFoundError(ImportServiceError):
    """Raised when snapshot artifact does not exist."""


@dataclass
class SnapshotBundle:
    external_post_id: str
    external_slug: str
    source_url: str
    slug: str
    title: str
    excerpt: str | None
    body_markdown: str
    cover_image_url: str | None
    status: str
    visibility: str
    published_at: str | None
    tags: list[str]
    series_title: str | None
    order_key: str


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_username(value: str) -> str:
    return value.strip().lstrip("@")


def _normalize_slug(value: str, fallback: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if normalized:
        return normalized
    fallback_value = re.sub(r"[^a-z0-9]+", "-", fallback.strip().lower()).strip("-")
    return fallback_value or f"velog-{uuid.uuid4().hex[:8]}"


def _suffix_slug(base_slug: str, external_post_id: str, index: int = 0) -> str:
    suffix_seed = external_post_id[:8] if external_post_id else f"item-{index + 1}"
    suffix = _normalize_slug(suffix_seed, f"item-{index + 1}")
    candidate = f"{base_slug}-{suffix}".strip("-")
    if candidate != base_slug:
        return candidate
    return f"{base_slug}-{index + 2}"


def _ensure_unique_bundle_slugs(bundles: list["SnapshotBundle"]) -> list["SnapshotBundle"]:
    seen_slugs: set[str] = set()
    for index, bundle in enumerate(bundles):
        base_slug = bundle.slug
        if base_slug not in seen_slugs:
            seen_slugs.add(base_slug)
            continue

        candidate = _suffix_slug(base_slug, bundle.external_post_id, index)
        while candidate in seen_slugs:
            candidate = _suffix_slug(candidate, bundle.external_post_id, index + 1)

        bundle.slug = candidate
        seen_slugs.add(candidate)

    return bundles


def _normalize_tags(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    normalized_tags: list[str] = []
    seen = set()
    for item in raw:
        if isinstance(item, str):
            value = item.strip().lower()
        elif isinstance(item, dict) and isinstance(item.get("name"), str):
            value = str(item["name"]).strip().lower()
        else:
            continue
        if not value or value in seen:
            continue
        seen.add(value)
        normalized_tags.append(value)
    return normalized_tags


def _normalize_series_title(raw: object) -> str | None:
    if not isinstance(raw, dict):
        return None
    name = raw.get("name")
    if not isinstance(name, str):
        return None
    normalized = name.strip()
    return normalized or None


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _to_iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _extract_internal_object_key(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    value = raw_value.strip()
    if not value:
        return None

    parsed = urlparse(value)
    path = parsed.path if parsed.scheme or parsed.netloc else value
    media_index = path.find(MEDIA_URL_PATH_PREFIX)
    if media_index < 0:
        return None
    object_key = unquote(path[media_index + len(MEDIA_URL_PATH_PREFIX):].lstrip("/"))
    return object_key or None


def _extract_markdown_media_object_keys(markdown_source: str) -> list[str]:
    matches = re.findall(
        r"""(?:https?://[^\s"')>]+/media/[^\s"')>]+|/media/[^\s"')>]+)""",
        markdown_source,
    )
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_match in matches:
        object_key = _extract_internal_object_key(raw_match)
        if object_key is None or object_key in seen:
            continue
        seen.add(object_key)
        normalized.append(object_key)
    return normalized


def _guess_asset_kind(object_key: str, mime_type: str) -> AssetKind:
    if mime_type.startswith("image/") or object_key.startswith("image/"):
        return AssetKind.IMAGE
    if mime_type.startswith("video/") or object_key.startswith("video/"):
        return AssetKind.VIDEO
    return AssetKind.FILE


class ImportService:
    def __init__(
        self,
        storage: MinioStorageClient,
        post_service: PostService,
        db: Session | None = None,
    ) -> None:
        self.storage = storage
        self.post_service = post_service
        self.db = db

    def create_velog_snapshot(self, username: str) -> SnapshotCreateRead:
        normalized_username = _normalize_username(username)
        if not normalized_username:
            raise ImportValidationError("username is required")

        bundles = self._collect_velog_bundles(normalized_username)
        snapshot_id = str(uuid.uuid4())
        object_key = self._snapshot_object_key(snapshot_id)
        artifact = self._build_snapshot_zip(normalized_username, bundles)

        self.storage.ensure_bucket()
        self.storage.put_bytes(
            object_key=object_key,
            data=artifact,
            content_type="application/zip",
        )

        now = _utcnow()
        return SnapshotCreateRead(
            snapshot_id=snapshot_id,
            source_provider=SourceProvider.VELOG,
            source_identity=normalized_username,
            status=SnapshotStatus.READY,
            total_items=len(bundles),
            artifact_object_key=object_key,
            created_at=now,
            updated_at=now,
        )

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
            cover_key = _extract_internal_object_key(post.cover_image_url)
            if cover_key is not None:
                media_object_keys.add(cover_key)
            media_object_keys.update(_extract_markdown_media_object_keys(post.body_markdown))

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
            cover_key = _extract_internal_object_key(series.cover_image_url)
            if cover_key is not None:
                media_object_keys.add(cover_key)

        media_rows = list(
            self.db.scalars(
                select(MediaAsset).where(MediaAsset.object_key.in_(sorted(media_object_keys)))
            )
        )
        media_by_object_key = {row.object_key: row for row in media_rows}

        manifest = {
            "schema_version": BACKUP_SCHEMA_VERSION,
            "generated_at": _to_iso_utc(_utcnow()),
            "post_count": len(posts),
            "media_count": len(media_object_keys),
            "series_override_count": len(series_overrides),
            "slugs": [post.slug for post in posts],
        }
        media_manifest = []
        for object_key in sorted(media_object_keys):
            media = media_by_object_key.get(object_key)
            if media is None:
                raise ImportValidationError(f"media metadata is missing for object key: {object_key}")
            media_manifest.append(
                {
                    "object_key": media.object_key,
                    "kind": media.kind.value,
                    "original_filename": media.original_filename,
                    "mime_type": media.mime_type,
                    "size_bytes": media.size_bytes,
                    "width": media.width,
                    "height": media.height,
                    "duration_seconds": media.duration_seconds,
                }
            )

        memory = io.BytesIO()
        self.storage.ensure_bucket()
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
                base_path = f"posts/{post.slug}"
                archive.writestr(
                    f"{base_path}/meta.json",
                    json.dumps(
                        {
                            "slug": post.slug,
                            "title": post.title,
                            "excerpt": post.excerpt,
                            "status": post.status.value,
                            "visibility": post.visibility.value,
                            "published_at": _to_iso_utc(post.published_at),
                            "tags": [tag.slug for tag in post.tags],
                            "series_title": post.series_title,
                            "cover_image_url": post.cover_image_url,
                        },
                        ensure_ascii=False,
                        indent=2,
                    ),
                )
                archive.writestr(f"{base_path}/content.md", post.body_markdown)

            for media in media_manifest:
                object_key = str(media["object_key"])
                try:
                    binary = self.storage.get_bytes(object_key)
                except Exception as exc:  # pragma: no cover - storage dependent
                    raise ImportValidationError(
                        f"failed to read media object for backup: {object_key}"
                    ) from exc
                archive.writestr(f"media/{object_key}", binary)

        file_name = f"traceoflight-posts-backup-{_utcnow().strftime('%Y%m%d-%H%M%S')}.zip"
        return file_name, memory.getvalue()

    def load_posts_backup(self, filename: str, data: bytes) -> BackupLoadRead:
        if self.db is None:
            raise ImportValidationError("database session is required")
        if not filename.strip():
            raise ImportValidationError("backup filename is required")
        if not data:
            raise ImportValidationError("backup file is empty")

        parsed = self._parse_posts_backup_zip(data)
        self.storage.ensure_bucket()
        for media in parsed["media_manifest"]:
            self.storage.put_bytes(
                object_key=str(media["object_key"]),
                data=parsed["media_bytes"][str(media["object_key"])],
                content_type=str(media["mime_type"]),
            )

        self.post_service.clear_all_posts()
        self.db.execute(delete(MediaAsset))
        self.db.commit()

        for media in parsed["media_manifest"]:
            self.db.add(
                MediaAsset(
                    kind=_guess_asset_kind(str(media["object_key"]), str(media["mime_type"])),
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
        self.db.commit()

        restored_posts = 0
        for bundle in parsed["bundles"]:
            self.post_service.create_post(self._bundle_to_post_create(bundle))
            restored_posts += 1

        rebuild_series_projection_cache()
        self.db.expire_all()
        overrides_applied = self._apply_series_cover_overrides(parsed["series_overrides"])

        return BackupLoadRead(
            restored_posts=restored_posts,
            restored_media=len(parsed["media_manifest"]),
            restored_series_overrides=overrides_applied,
        )

    def run_snapshot_import(self, snapshot_id: str, mode: ImportMode) -> SnapshotImportRunRead:
        if not snapshot_id.strip():
            raise ImportValidationError("snapshot_id is required")

        object_key = self._snapshot_object_key(snapshot_id)
        self.storage.ensure_bucket()
        if not self.storage.object_exists(object_key):
            raise SnapshotNotFoundError("snapshot artifact not found")

        snapshot_data = self.storage.get_bytes(object_key)
        bundles = self._read_snapshot_bundles(snapshot_data)
        is_apply_mode = mode == ImportMode.APPLY

        created_items = 0
        updated_items = 0
        failed_items = 0
        errors: list[SnapshotImportErrorItem] = []

        if is_apply_mode:
            self.post_service.clear_all_posts()

        for bundle in bundles:
            try:
                payload = self._bundle_to_post_create(bundle)
                if not is_apply_mode:
                    existing = self.post_service.get_post_by_slug(payload.slug)
                    if existing is None:
                        created_items += 1
                    else:
                        updated_items += 1
                    continue

                self.post_service.create_post(payload)
                created_items += 1
            except Exception as exc:  # pragma: no cover - defensive branch
                failed_items += 1
                errors.append(
                    SnapshotImportErrorItem(
                        external_post_id=bundle.external_post_id,
                        slug=bundle.slug,
                        detail=str(exc),
                    )
                )

        status = ImportJobStatus.SUCCEEDED
        if failed_items and failed_items < len(bundles):
            status = ImportJobStatus.PARTIALLY_FAILED
        elif failed_items and failed_items == len(bundles):
            status = ImportJobStatus.FAILED

        return SnapshotImportRunRead(
            job_id=str(uuid.uuid4()),
            snapshot_id=snapshot_id,
            mode=mode,
            status=status,
            total_items=len(bundles),
            created_items=created_items,
            updated_items=updated_items,
            failed_items=failed_items,
            errors=errors,
        )

    def _parse_posts_backup_zip(self, backup_data: bytes) -> dict[str, object]:
        try:
            archive = ZipFile(io.BytesIO(backup_data))
        except Exception as exc:
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

            if not isinstance(manifest, dict) or manifest.get("schema_version") != BACKUP_SCHEMA_VERSION:
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
                        "original_filename": str(item.get("original_filename", "")).strip() or object_key.rsplit("/", 1)[-1],
                        "mime_type": mime_type,
                        "size_bytes": int(item.get("size_bytes", len(media_bytes[object_key])) or len(media_bytes[object_key])),
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
                bundles.append(
                    SnapshotBundle(
                        external_post_id=f"backup-{slug}",
                        external_slug=slug,
                        source_url=f"/blog/{slug}",
                        slug=_normalize_slug(str(meta.get("slug", slug)), title),
                        title=title,
                        excerpt=str(meta.get("excerpt")).strip() if isinstance(meta.get("excerpt"), str) else None,
                        body_markdown=body_markdown,
                        cover_image_url=str(meta.get("cover_image_url")).strip() if isinstance(meta.get("cover_image_url"), str) else None,
                        status="draft" if str(meta.get("status", "published")).strip().lower() == "draft" else "published",
                        visibility="private" if str(meta.get("visibility", "public")).strip().lower() == "private" else "public",
                        published_at=str(meta.get("published_at")).strip() if isinstance(meta.get("published_at"), str) else None,
                        tags=_normalize_tags(meta.get("tags")),
                        series_title=str(meta.get("series_title")).strip() if isinstance(meta.get("series_title"), str) else None,
                        order_key=str(meta.get("published_at")).strip() if isinstance(meta.get("published_at"), str) else slug,
                    )
                )

        bundles.sort(key=lambda item: (item.order_key, item.external_post_id))
        return {
            "bundles": bundles,
            "media_manifest": normalized_media_manifest,
            "media_bytes": media_bytes,
            "series_overrides": series_overrides,
        }

    def _apply_series_cover_overrides(self, series_overrides: list[object]) -> int:
        if self.db is None:
            return 0
        applied = 0
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
        self.db.commit()
        return applied

    def _collect_velog_bundles(self, username: str) -> list[SnapshotBundle]:
        bundles: list[SnapshotBundle] = []
        seen_post_ids: set[str] = set()
        cursor: str | None = None

        while True:
            data = self._request_velog_graphql(
                POSTS_QUERY,
                {
                    "username": username,
                    "limit": VELOG_POSTS_PAGE_SIZE,
                    "cursor": cursor,
                },
            )
            posts = data.get("posts")
            if not isinstance(posts, list):
                raise ImportSourceError("velog posts payload is invalid")
            if not posts:
                break

            last_cursor: str | None = None
            for post in posts:
                if not isinstance(post, dict):
                    continue
                external_post_id = str(post.get("id", "")).strip()
                external_slug = str(post.get("url_slug", "")).strip()
                if not external_post_id or not external_slug or external_post_id in seen_post_ids:
                    continue

                seen_post_ids.add(external_post_id)
                last_cursor = external_post_id

                detail = self._request_velog_graphql(
                    POST_DETAIL_QUERY,
                    {"username": username, "url_slug": external_slug},
                )
                detail_post = detail.get("post")
                if not isinstance(detail_post, dict):
                    continue

                body_markdown = str(detail_post.get("body", "")).strip()
                if not body_markdown:
                    continue

                title = str(post.get("title", "")).strip() or external_slug
                excerpt = post.get("short_description")
                excerpt_value = excerpt.strip() if isinstance(excerpt, str) else None
                is_private = bool(post.get("is_private"))
                is_temp = bool(post.get("is_temp"))
                released_at = post.get("released_at")
                updated_at = post.get("updated_at")
                published_at = released_at if isinstance(released_at, str) else None
                order_key = published_at or (updated_at if isinstance(updated_at, str) else None)
                order_key = order_key or _to_iso_utc(_utcnow()) or ""

                slug = _normalize_slug(external_slug, title)
                bundles.append(
                    SnapshotBundle(
                        external_post_id=external_post_id,
                        external_slug=external_slug,
                        source_url=f"https://velog.io/@{username}/{external_slug}",
                        slug=slug,
                        title=title,
                        excerpt=excerpt_value,
                        body_markdown=body_markdown,
                        cover_image_url=post.get("thumbnail")
                        if isinstance(post.get("thumbnail"), str)
                        else None,
                        status="draft" if is_temp else "published",
                        visibility="private" if is_private else "public",
                        published_at=published_at,
                        tags=_normalize_tags(post.get("tags")),
                        series_title=_normalize_series_title(post.get("series")),
                        order_key=order_key,
                    )
                )

            if len(posts) < VELOG_POSTS_PAGE_SIZE:
                break
            if not last_cursor or last_cursor == cursor:
                break
            cursor = last_cursor

        bundles.sort(key=lambda item: (item.order_key, item.external_post_id))
        return _ensure_unique_bundle_slugs(bundles)

    def _request_velog_graphql(self, query: str, variables: dict[str, object]) -> dict[str, object]:
        payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
        request = Request(
            VELOG_GRAPHQL_URL,
            data=payload,
            method="POST",
            headers={
                "content-type": "application/json",
                "user-agent": "traceoflight-importer/1.0",
            },
        )
        try:
            with urlopen(request, timeout=20) as response:  # noqa: S310
                raw = response.read()
        except (HTTPError, URLError, TimeoutError) as exc:
            raise ImportSourceError(f"failed to fetch velog source: {exc}") from exc

        try:
            parsed = json.loads(raw.decode("utf-8"))
        except ValueError as exc:
            raise ImportSourceError("velog source returned invalid json") from exc

        if not isinstance(parsed, dict):
            raise ImportSourceError("velog source payload type is invalid")
        if parsed.get("errors"):
            raise ImportSourceError("velog graphql returned errors")
        data = parsed.get("data")
        if not isinstance(data, dict):
            raise ImportSourceError("velog source data is missing")
        return data

    def _build_snapshot_zip(self, username: str, bundles: list[SnapshotBundle]) -> bytes:
        memory = io.BytesIO()
        generated_at = _to_iso_utc(_utcnow()) or ""
        manifest = {
            "schema_version": "v1",
            "source_provider": "velog",
            "source_identity": username,
            "generated_at": generated_at,
            "post_ids": [bundle.external_post_id for bundle in bundles],
        }

        with ZipFile(memory, mode="w", compression=ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            for bundle in bundles:
                base_path = f"posts/{bundle.external_post_id}"
                meta = {
                    "external_post_id": bundle.external_post_id,
                    "external_slug": bundle.external_slug,
                    "source_url": bundle.source_url,
                    "slug": bundle.slug,
                    "title": bundle.title,
                    "excerpt": bundle.excerpt,
                    "status": bundle.status,
                    "visibility": bundle.visibility,
                    "published_at": bundle.published_at,
                    "tags": bundle.tags,
                    "series_title": bundle.series_title,
                    "cover_image_url": bundle.cover_image_url,
                    "order_key": bundle.order_key,
                }
                archive.writestr(
                    f"{base_path}/meta.json",
                    json.dumps(meta, ensure_ascii=False, indent=2),
                )
                archive.writestr(f"{base_path}/content.md", bundle.body_markdown)

        return memory.getvalue()

    def _read_snapshot_bundles(self, snapshot_data: bytes) -> list[SnapshotBundle]:
        try:
            archive = ZipFile(io.BytesIO(snapshot_data))
        except Exception as exc:
            raise ImportValidationError("snapshot zip is invalid") from exc

        with archive:
            try:
                manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            except KeyError as exc:
                raise ImportValidationError("manifest.json is missing") from exc
            except ValueError as exc:
                raise ImportValidationError("manifest.json is invalid") from exc

            post_ids = manifest.get("post_ids") if isinstance(manifest, dict) else None
            if not isinstance(post_ids, list):
                raise ImportValidationError("manifest post_ids is invalid")

            bundles: list[SnapshotBundle] = []
            for external_post_id_raw in post_ids:
                external_post_id = str(external_post_id_raw).strip()
                if not external_post_id:
                    continue
                base_path = f"posts/{external_post_id}"
                try:
                    meta = json.loads(archive.read(f"{base_path}/meta.json").decode("utf-8"))
                    body_markdown = archive.read(f"{base_path}/content.md").decode("utf-8")
                except KeyError as exc:
                    raise ImportValidationError(
                        f"snapshot entry for {external_post_id} is incomplete"
                    ) from exc
                except ValueError as exc:
                    raise ImportValidationError(
                        f"snapshot meta for {external_post_id} is invalid"
                    ) from exc

                if not isinstance(meta, dict):
                    raise ImportValidationError(f"snapshot meta for {external_post_id} is invalid")

                slug_source = meta.get("slug")
                title_source = meta.get("title")
                slug = (
                    _normalize_slug(str(slug_source), str(title_source or external_post_id))
                    if isinstance(slug_source, str)
                    else _normalize_slug(str(title_source or external_post_id), external_post_id)
                )
                title = str(title_source).strip() if isinstance(title_source, str) else slug
                excerpt = meta.get("excerpt")
                excerpt_value = excerpt.strip() if isinstance(excerpt, str) else None
                cover_value = meta.get("cover_image_url")
                cover_image_url = cover_value.strip() if isinstance(cover_value, str) else None
                status_value = str(meta.get("status", "published")).strip().lower()
                visibility_value = str(meta.get("visibility", "public")).strip().lower()
                published_value = (
                    str(meta.get("published_at")).strip()
                    if isinstance(meta.get("published_at"), str)
                    else None
                )
                order_key_value = (
                    str(meta.get("order_key")).strip()
                    if isinstance(meta.get("order_key"), str)
                    else ""
                )
                tags = _normalize_tags(meta.get("tags"))
                series_title = (
                    str(meta.get("series_title")).strip()
                    if isinstance(meta.get("series_title"), str)
                    else None
                )
                external_slug_value = (
                    str(meta.get("external_slug")).strip()
                    if isinstance(meta.get("external_slug"), str)
                    else slug
                )
                source_url_value = (
                    str(meta.get("source_url")).strip()
                    if isinstance(meta.get("source_url"), str)
                    else ""
                )

                bundles.append(
                    SnapshotBundle(
                        external_post_id=external_post_id,
                        external_slug=external_slug_value,
                        source_url=source_url_value,
                        slug=slug,
                        title=title,
                        excerpt=excerpt_value,
                        body_markdown=body_markdown,
                        cover_image_url=cover_image_url,
                        status="draft" if status_value == "draft" else "published",
                        visibility="private" if visibility_value == "private" else "public",
                        published_at=published_value,
                        tags=tags,
                        series_title=series_title or None,
                        order_key=order_key_value or (published_value or ""),
                    )
                )

        bundles.sort(key=lambda item: (item.order_key, item.external_post_id))
        return _ensure_unique_bundle_slugs(bundles)

    def _bundle_to_post_create(self, bundle: SnapshotBundle) -> PostCreate:
        status = PostStatus.DRAFT if bundle.status == "draft" else PostStatus.PUBLISHED
        visibility = PostVisibility.PRIVATE if bundle.visibility == "private" else PostVisibility.PUBLIC
        return PostCreate(
            slug=bundle.slug,
            title=bundle.title,
            excerpt=bundle.excerpt,
            body_markdown=bundle.body_markdown,
            cover_image_url=bundle.cover_image_url,
            status=status,
            visibility=visibility,
            published_at=_parse_datetime(bundle.published_at),
            tags=bundle.tags,
            series_title=bundle.series_title,
        )

    def _snapshot_object_key(self, snapshot_id: str) -> str:
        return f"{SNAPSHOT_OBJECT_PREFIX}/{snapshot_id}.zip"
