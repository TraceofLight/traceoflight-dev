"""Shared text-normalization helpers used across services and repositories."""

from __future__ import annotations

from collections.abc import Iterable


def normalize_optional_text(value: str | None) -> str | None:
    """Return ``value`` stripped, or ``None`` if blank or already ``None``."""

    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def normalize_slug_list(
    raw_values: Iterable[str],
    *,
    lowercase: bool = True,
) -> list[str]:
    """Strip, optionally lowercase, and dedupe an iterable of slug strings."""

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_values:
        slug = raw.strip()
        if lowercase:
            slug = slug.lower()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        normalized.append(slug)
    return normalized
