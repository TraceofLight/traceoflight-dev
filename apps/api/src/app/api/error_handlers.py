from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.exc import IntegrityError


def integrity_conflict_detail(
    exc: IntegrityError,
    *,
    rules: Sequence[tuple[Sequence[str], str]],
    fallback: str,
) -> str:
    source = getattr(exc, "orig", exc)
    message = str(source).lower()
    for hints, detail in rules:
        if any(hint in message for hint in hints):
            return detail
    return fallback
