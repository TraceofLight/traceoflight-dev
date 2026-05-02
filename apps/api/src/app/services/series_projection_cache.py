from __future__ import annotations

import asyncio
import logging
import threading
from collections import defaultdict
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.text import normalize_optional_text
from app.db.session import SessionLocal
from app.models.post import Post, PostContentKind
from app.models.series import Series, SeriesPost

logger = logging.getLogger(__name__)

_runtime_lock = threading.Lock()
_runtime_loop: asyncio.AbstractEventLoop | None = None
_runtime_refresh_event: asyncio.Event | None = None


@dataclass(frozen=True)
class SeriesProjectionRow:
    slug: str
    title: str
    post_ids: tuple[UUID, ...]


def _slugify_series_title(title: str) -> str:
    chars: list[str] = []
    last_was_dash = False
    for char in title.strip():
        if char.isalnum():
            chars.append(char)
            last_was_dash = False
            continue
        if last_was_dash:
            continue
        chars.append("-")
        last_was_dash = True
    normalized = "".join(chars).strip("-")
    return normalized or "series"


def _projection_order_key(post: Post) -> tuple[datetime, datetime, str]:
    primary = post.published_at or post.created_at or post.updated_at or datetime.now(timezone.utc)
    secondary = post.created_at or post.updated_at or primary
    return (primary, secondary, post.slug)


def _build_projection_rows(
    posts: list[Post],
    existing_order_by_slug: dict[str, dict[UUID, int]] | None = None,
) -> list[SeriesProjectionRow]:
    existing_order_by_slug = existing_order_by_slug or {}
    grouped_posts: dict[str, list[Post]] = defaultdict(list)
    grouped_titles: dict[str, tuple[datetime, str]] = {}

    for post in posts:
        if getattr(post, "content_kind", PostContentKind.BLOG) != PostContentKind.BLOG:
            continue
        series_title = normalize_optional_text(post.series_title)
        if series_title is None:
            continue
        series_slug = _slugify_series_title(series_title)
        grouped_posts[series_slug].append(post)

        candidate_at = post.updated_at or post.created_at or datetime.now(timezone.utc)
        current = grouped_titles.get(series_slug)
        if current is None or candidate_at >= current[0]:
            grouped_titles[series_slug] = (candidate_at, series_title)

    projection_rows: list[SeriesProjectionRow] = []
    for slug in sorted(grouped_posts):
        existing_order = existing_order_by_slug.get(slug, {})
        ordered_posts = sorted(
            grouped_posts[slug],
            key=lambda post: (
                existing_order.get(post.id, 10**9),
                *_projection_order_key(post),
            ),
        )
        projection_rows.append(
            SeriesProjectionRow(
                slug=slug,
                title=grouped_titles[slug][1],
                post_ids=tuple(post.id for post in ordered_posts),
            )
        )
    return projection_rows


def rebuild_series_projection_cache() -> dict[str, int]:
    with SessionLocal() as db:
        posts = list(db.scalars(select(Post).where(Post.series_title.is_not(None))))
        existing_rows = list(
            db.scalars(
                select(Series).options(selectinload(Series.series_posts))
            )
        )
        existing_order_by_slug = {
            row.slug: {mapping.post_id: mapping.order_index for mapping in row.series_posts}
            for row in existing_rows
        }
        projection_rows = _build_projection_rows(
            posts,
            existing_order_by_slug=existing_order_by_slug,
        )

        existing_by_slug = {row.slug: row for row in existing_rows}
        target_slugs = {row.slug for row in projection_rows}

        created_series_count = 0
        retained_series_count = 0
        deleted_series_count = 0
        mapped_post_count = 0

        try:
            db.execute(delete(SeriesPost))

            for row in projection_rows:
                series = existing_by_slug.get(row.slug)
                if series is None:
                    series = Series(
                        slug=row.slug,
                        title=row.title,
                        description=f"{row.title} series",
                        cover_image_url=None,
                    )
                    db.add(series)
                    db.flush()
                    created_series_count += 1
                else:
                    series.title = row.title
                    if not (series.description or "").strip():
                        series.description = f"{row.title} series"
                    retained_series_count += 1

                for order_index, post_id in enumerate(row.post_ids, start=1):
                    db.add(
                        SeriesPost(
                            series_id=series.id,
                            post_id=post_id,
                            order_index=order_index,
                        )
                    )
                    mapped_post_count += 1

            for series in existing_rows:
                if series.slug in target_slugs:
                    continue
                db.delete(series)
                deleted_series_count += 1

            db.commit()
        except Exception:
            db.rollback()
            raise

    return {
        "series_count": len(projection_rows),
        "mapped_post_count": mapped_post_count,
        "created_series_count": created_series_count,
        "retained_series_count": retained_series_count,
        "deleted_series_count": deleted_series_count,
    }


def _register_runtime(loop: asyncio.AbstractEventLoop, refresh_event: asyncio.Event) -> None:
    global _runtime_loop, _runtime_refresh_event
    with _runtime_lock:
        _runtime_loop = loop
        _runtime_refresh_event = refresh_event


def _unregister_runtime(loop: asyncio.AbstractEventLoop) -> None:
    global _runtime_loop, _runtime_refresh_event
    with _runtime_lock:
        if _runtime_loop is loop:
            _runtime_loop = None
            _runtime_refresh_event = None


def request_series_projection_refresh(reason: str = "post-change") -> None:
    with _runtime_lock:
        loop = _runtime_loop
        refresh_event = _runtime_refresh_event

    if loop is None or refresh_event is None:
        return

    logger.debug("series projection refresh requested: %s", reason)
    loop.call_soon_threadsafe(refresh_event.set)


async def _wait_for_refresh_or_stop(
    refresh_event: asyncio.Event,
    stop_event: asyncio.Event,
) -> None:
    if refresh_event.is_set() or stop_event.is_set():
        return

    refresh_wait = asyncio.create_task(refresh_event.wait())
    stop_wait = asyncio.create_task(stop_event.wait())
    done, pending = await asyncio.wait(
        {refresh_wait, stop_wait},
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()
    for task in done:
        with suppress(asyncio.CancelledError):
            await task


async def run_series_projection_loop(stop_event: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()
    refresh_event = asyncio.Event()
    debounce_seconds = max(0.1, float(settings.series_projection_rebuild_debounce_seconds))

    _register_runtime(loop, refresh_event)
    refresh_event.set()
    try:
        while not stop_event.is_set():
            await _wait_for_refresh_or_stop(refresh_event, stop_event)
            if stop_event.is_set():
                break

            refresh_event.clear()
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(stop_event.wait(), timeout=debounce_seconds)
            if stop_event.is_set():
                break
            if refresh_event.is_set():
                continue

            try:
                summary = await asyncio.to_thread(rebuild_series_projection_cache)
                logger.info(
                    "series projection rebuilt: series=%s mapped_posts=%s created=%s retained=%s deleted=%s",
                    summary["series_count"],
                    summary["mapped_post_count"],
                    summary["created_series_count"],
                    summary["retained_series_count"],
                    summary["deleted_series_count"],
                )
            except asyncio.CancelledError:
                # Cancellation must propagate so the scheduler can shut down.
                raise
            except Exception:  # pragma: no cover - keep background loop alive
                # Loop intentionally swallows per-run errors (DB outage, etc.).
                logger.exception("series projection rebuild failed")
    finally:
        _unregister_runtime(loop)
