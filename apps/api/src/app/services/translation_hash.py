"""Deterministic source-hash helper for translation change detection."""

from __future__ import annotations

import hashlib
import json

_FIELD_SEPARATOR = "\x1f"  # ASCII unit separator — never appears in user content


def compute_source_hash(*, title: str, excerpt: str | None, body_markdown: str) -> str:
    """Return a sha256 hex digest over the translatable fields of a post or series.

    The hash intentionally excludes non-translated fields (cover image, status,
    published_at, etc.) so changes to those fields do NOT trigger re-translation.

    Used by SeriesTranslationStrategy directly; posts should use
    compute_post_source_hash which also covers project_profile fields.
    """
    payload = _FIELD_SEPARATOR.join(
        [
            title or "",
            excerpt or "",
            body_markdown or "",
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def compute_post_source_hash(
    *,
    title: str,
    excerpt: str | None,
    body_markdown: str,
    project_profile=None,
) -> str:
    """Return a sha256 hex digest over the translatable fields of a post.

    Unlike compute_source_hash, this also incorporates project_profile text
    fields when a profile is present, so edits to role_summary, project_intro,
    period_label, highlights, or resource link labels trigger re-translation.
    """
    parts = [title or "", excerpt or "", body_markdown or ""]
    if project_profile is not None:
        parts.extend([
            project_profile.period_label or "",
            project_profile.role_summary or "",
            project_profile.project_intro or "",
            json.dumps(
                project_profile.highlights_json or [],
                sort_keys=True,
                ensure_ascii=False,
            ),
            json.dumps(
                [
                    {"label": link.get("label", ""), "href": link.get("href", "")}
                    for link in (project_profile.resource_links_json or [])
                ],
                ensure_ascii=False,
            ),
        ])
    return hashlib.sha256(_FIELD_SEPARATOR.join(parts).encode("utf-8")).hexdigest()
