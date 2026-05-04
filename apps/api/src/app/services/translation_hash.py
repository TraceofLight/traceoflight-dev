"""Deterministic source-hash helper for translation change detection."""

from __future__ import annotations

import hashlib

_FIELD_SEPARATOR = "\x1f"  # ASCII unit separator — never appears in user content


def compute_source_hash(*, title: str, excerpt: str | None, body_markdown: str) -> str:
    """Return a sha256 hex digest over the translatable fields of a post.

    The hash intentionally excludes non-translated fields (cover image, status,
    published_at, etc.) so changes to those fields do NOT trigger re-translation.
    """
    payload = _FIELD_SEPARATOR.join(
        [
            title or "",
            excerpt or "",
            body_markdown or "",
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
