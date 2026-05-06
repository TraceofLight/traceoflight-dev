from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from app.services.imports.backup.bundle import BackupBundle, PostEntry
from app.services.imports.backup.schema import (
    BACKUP_SCHEMA_VERSION,
    DB_MEDIA_ASSETS_PATH,
    DB_POST_COMMENTS_PATH,
    DB_POST_TAGS_PATH,
    DB_SERIES_POSTS_PATH,
    DB_SITE_PROFILE_PATH,
    DB_TAGS_PATH,
    MANIFEST_PATH,
    MEDIA_DIR,
    POSTS_DIR,
    SERIES_DIR,
    media_path,
    post_content_path,
    post_meta_path,
    series_path,
)
from app.services.imports.errors import ImportValidationError
from app.services.series_projection_cache import _slugify_series_title


def _dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def build_backup_zip(bundle: BackupBundle) -> bytes:
    manifest = {
        "schema_version": BACKUP_SCHEMA_VERSION,
        "generated_at": bundle.generated_at.astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "counts": {
            "posts": len(bundle.posts),
            "series": len(bundle.series),
            "tags": len(bundle.tags),
            "post_tags": len(bundle.post_tags),
            "series_posts": len(bundle.series_posts),
            "post_comments": len(bundle.post_comments),
            "media_assets": len(bundle.media_assets),
        },
    }

    memory = io.BytesIO()
    with ZipFile(memory, mode="w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(MANIFEST_PATH, _dumps(manifest))
        archive.writestr(DB_SITE_PROFILE_PATH, _dumps(bundle.site_profile))
        archive.writestr(DB_TAGS_PATH, _dumps(bundle.tags))
        archive.writestr(DB_POST_TAGS_PATH, _dumps(bundle.post_tags))
        archive.writestr(DB_SERIES_POSTS_PATH, _dumps(bundle.series_posts))
        archive.writestr(DB_POST_COMMENTS_PATH, _dumps(bundle.post_comments))
        archive.writestr(DB_MEDIA_ASSETS_PATH, _dumps(bundle.media_assets))

        for entry in bundle.posts:
            group_id = str(entry.meta["translation_group_id"])
            locale = str(entry.meta["locale"])
            archive.writestr(post_meta_path(group_id, locale), _dumps(entry.meta))
            archive.writestr(post_content_path(group_id, locale), entry.body_markdown)

        for series_payload in bundle.series:
            group_id = str(series_payload["translation_group_id"])
            locale = str(series_payload["locale"])
            archive.writestr(series_path(group_id, locale), _dumps(series_payload))

        for object_key, payload_bytes in bundle.media_bytes.items():
            archive.writestr(media_path(object_key), payload_bytes)

    return memory.getvalue()


def _safe_loads(archive: ZipFile, path: str) -> object:
    try:
        return json.loads(archive.read(path).decode("utf-8"))
    except KeyError as exc:
        raise ImportValidationError(f"backup archive missing {path}") from exc
    except ValueError as exc:
        raise ImportValidationError(f"backup archive {path} is not valid JSON") from exc


def parse_backup_zip(backup_data: bytes) -> "BackupBundle":
    try:
        archive = ZipFile(io.BytesIO(backup_data))
    except (BadZipFile, OSError) as exc:
        raise ImportValidationError("backup zip is invalid") from exc

    with archive:
        manifest = _safe_loads(archive, MANIFEST_PATH)
        if (
            not isinstance(manifest, dict)
            or manifest.get("schema_version") != BACKUP_SCHEMA_VERSION
        ):
            raise ImportValidationError("backup manifest schema is invalid")

        site_profile = _safe_loads(archive, DB_SITE_PROFILE_PATH)
        tags = _safe_loads(archive, DB_TAGS_PATH)
        post_tags = _safe_loads(archive, DB_POST_TAGS_PATH)
        series_posts = _safe_loads(archive, DB_SERIES_POSTS_PATH)
        post_comments = _safe_loads(archive, DB_POST_COMMENTS_PATH)
        media_assets = _safe_loads(archive, DB_MEDIA_ASSETS_PATH)

        for label, value in (
            ("tags", tags),
            ("post_tags", post_tags),
            ("series_posts", series_posts),
            ("post_comments", post_comments),
            ("media_assets", media_assets),
        ):
            if not isinstance(value, list):
                raise ImportValidationError(f"backup {label} payload must be a list")

        posts: list[PostEntry] = []
        series: list[dict] = []
        media_bytes: dict[str, bytes] = {}

        for name in archive.namelist():
            if name.startswith(f"{POSTS_DIR}/") and name.endswith("/meta.json"):
                meta = _safe_loads(archive, name)
                if not isinstance(meta, dict):
                    raise ImportValidationError(f"backup {name} must be an object")
                content_path = name[: -len("meta.json")] + "content.md"
                try:
                    body = archive.read(content_path).decode("utf-8")
                except KeyError as exc:
                    raise ImportValidationError(
                        f"backup archive missing {content_path}"
                    ) from exc
                posts.append(PostEntry(meta=meta, body_markdown=body))
            elif name.startswith(f"{SERIES_DIR}/") and name.endswith(".json"):
                payload = _safe_loads(archive, name)
                if not isinstance(payload, dict):
                    raise ImportValidationError(f"backup {name} must be an object")
                series.append(payload)
            elif name.startswith(f"{MEDIA_DIR}/"):
                object_key = name[len(MEDIA_DIR) + 1 :]
                if object_key:
                    media_bytes[object_key] = archive.read(name)

        bundle = BackupBundle(
            site_profile=site_profile if isinstance(site_profile, dict) else None,
            tags=tags,
            post_tags=post_tags,
            media_assets=media_assets,
            media_bytes=media_bytes,
            posts=posts,
            series=series,
            series_posts=series_posts,
            post_comments=post_comments,
            generated_at=datetime.fromisoformat(
                str(manifest["generated_at"]).replace("Z", "+00:00")
            ),
        )

        _validate_bundle(bundle, manifest.get("counts", {}))
        return bundle


def _validate_bundle(bundle: "BackupBundle", expected_counts: dict) -> None:
    actual_counts = {
        "posts": len(bundle.posts),
        "series": len(bundle.series),
        "tags": len(bundle.tags),
        "post_tags": len(bundle.post_tags),
        "series_posts": len(bundle.series_posts),
        "post_comments": len(bundle.post_comments),
        "media_assets": len(bundle.media_assets),
    }
    for key, expected in expected_counts.items():
        if actual_counts.get(key) != expected:
            raise ImportValidationError(
                f"backup count mismatch for {key}: manifest={expected} actual={actual_counts.get(key)}"
            )

    post_ids = {str(entry.meta["id"]) for entry in bundle.posts}
    tag_ids = {str(tag["id"]) for tag in bundle.tags}
    series_ids = {str(s["id"]) for s in bundle.series}
    comment_ids = {str(c["id"]) for c in bundle.post_comments}

    for link in bundle.post_tags:
        if str(link["post_id"]) not in post_ids:
            raise ImportValidationError("post_tags references unknown post_id")
        if str(link["tag_id"]) not in tag_ids:
            raise ImportValidationError("post_tags references unknown tag_id")

    for sp in bundle.series_posts:
        if str(sp["series_id"]) not in series_ids:
            raise ImportValidationError("series_posts references unknown series_id")
        if str(sp["post_id"]) not in post_ids:
            raise ImportValidationError("series_posts references unknown post_id")

    for media in bundle.media_assets:
        owner = media.get("owner_post_id")
        if owner is not None and str(owner) not in post_ids:
            raise ImportValidationError(
                "media_assets owner_post_id references unknown post"
            )

    for comment in bundle.post_comments:
        if str(comment["post_id"]) not in post_ids:
            raise ImportValidationError("post_comments references unknown post_id")
        for fk in ("root_comment_id", "reply_to_comment_id"):
            target = comment.get(fk)
            if target is not None and str(target) not in comment_ids:
                raise ImportValidationError(
                    f"post_comments {fk} references unknown comment"
                )

    ko_series_slugs = {
        str(s["slug"]) for s in bundle.series if str(s.get("locale")) == "ko"
    }
    for entry in bundle.posts:
        series_title = entry.meta.get("series_title")
        if not series_title or str(entry.meta.get("locale")) != "ko":
            continue
        if _slugify_series_title(str(series_title)) not in ko_series_slugs:
            raise ImportValidationError(
                f"post '{entry.meta.get('slug')}' references series_title without matching ko series row"
            )
