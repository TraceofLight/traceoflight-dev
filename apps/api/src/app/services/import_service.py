from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import io
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import uuid
from zipfile import ZIP_DEFLATED, ZipFile

from app.models.post import PostStatus, PostVisibility
from app.schemas.imports import (
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
from app.storage.minio_client import MinioStorageClient

VELOG_GRAPHQL_URL = "https://v2.velog.io/graphql"
SNAPSHOT_OBJECT_PREFIX = "imports/snapshots"
VELOG_POSTS_PAGE_SIZE = 50

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


class ImportService:
    def __init__(self, storage: MinioStorageClient, post_service: PostService) -> None:
        self.storage = storage
        self.post_service = post_service

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

    def run_snapshot_import(self, snapshot_id: str, mode: ImportMode) -> SnapshotImportRunRead:
        if not snapshot_id.strip():
            raise ImportValidationError("snapshot_id is required")

        object_key = self._snapshot_object_key(snapshot_id)
        self.storage.ensure_bucket()
        if not self.storage.object_exists(object_key):
            raise SnapshotNotFoundError("snapshot artifact not found")

        snapshot_data = self.storage.get_bytes(object_key)
        bundles = self._read_snapshot_bundles(snapshot_data)

        created_items = 0
        updated_items = 0
        failed_items = 0
        errors: list[SnapshotImportErrorItem] = []

        for bundle in bundles:
            try:
                payload = self._bundle_to_post_create(bundle)
                existing = self.post_service.get_post_by_slug(payload.slug)
                if mode == ImportMode.DRY_RUN:
                    if existing is None:
                        created_items += 1
                    else:
                        updated_items += 1
                    continue

                if existing is None:
                    self.post_service.create_post(payload)
                    created_items += 1
                else:
                    self.post_service.update_post_by_slug(existing.slug, payload)
                    updated_items += 1
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
        return bundles

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
        return bundles

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
