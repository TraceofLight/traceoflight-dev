from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
import uuid


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


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_slug(value: str, fallback: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if normalized:
        return normalized
    fallback_value = re.sub(r"[^a-z0-9]+", "-", fallback.strip().lower()).strip("-")
    return fallback_value or f"import-{uuid.uuid4().hex[:8]}"


def _suffix_slug(base_slug: str, external_post_id: str, index: int = 0) -> str:
    suffix_seed = external_post_id[:8] if external_post_id else f"item-{index + 1}"
    suffix = normalize_slug(suffix_seed, f"item-{index + 1}")
    candidate = f"{base_slug}-{suffix}".strip("-")
    if candidate != base_slug:
        return candidate
    return f"{base_slug}-{index + 2}"


def ensure_unique_bundle_slugs(bundles: list[SnapshotBundle]) -> list[SnapshotBundle]:
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


def normalize_tags(raw: object) -> list[str]:
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


def normalize_series_title(raw: object) -> str | None:
    if not isinstance(raw, dict):
        return None
    name = raw.get("name")
    if not isinstance(name, str):
        return None
    normalized = name.strip()
    return normalized or None


def parse_datetime(value: str | None) -> datetime | None:
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


def to_iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
