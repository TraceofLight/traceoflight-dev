from __future__ import annotations

import mimetypes
import re
from urllib.parse import unquote, urlparse

from app.models.media import AssetKind

MEDIA_URL_PATH_PREFIX = "/media/"


def extract_internal_object_key(raw_value: str | None) -> str | None:
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


def extract_markdown_media_object_keys(markdown_source: str) -> list[str]:
    matches = re.findall(
        r"""(?:https?://[^\s"')>]+/media/[^\s"')>]+|/media/[^\s"')>]+)""",
        markdown_source,
    )
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_match in matches:
        object_key = extract_internal_object_key(raw_match)
        if object_key is None or object_key in seen:
            continue
        seen.add(object_key)
        normalized.append(object_key)
    return normalized


def guess_asset_kind(object_key: str, mime_type: str) -> AssetKind:
    if mime_type.startswith("image/") or object_key.startswith("image/"):
        return AssetKind.IMAGE
    if mime_type.startswith("video/") or object_key.startswith("video/"):
        return AssetKind.VIDEO
    return AssetKind.FILE


def fallback_media_manifest_entry(object_key: str, binary: bytes) -> dict[str, object]:
    original_filename = object_key.rsplit("/", 1)[-1]
    mime_type = mimetypes.guess_type(original_filename)[0] or "application/octet-stream"
    return {
        "object_key": object_key,
        "kind": guess_asset_kind(object_key, mime_type).value,
        "original_filename": original_filename,
        "mime_type": mime_type,
        "size_bytes": len(binary),
        "width": None,
        "height": None,
        "duration_seconds": None,
    }
