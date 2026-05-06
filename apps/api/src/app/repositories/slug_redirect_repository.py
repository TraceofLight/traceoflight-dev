from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.post import Post, PostContentKind, PostLocale, PostStatus, PostVisibility
from app.models.series import Series
from app.models.slug_redirect import PostSlugRedirect, SeriesSlugRedirect


@dataclass(frozen=True)
class RedirectResolution:
    redirect_id: uuid.UUID
    target_slug: str


class SlugRedirectRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ---- Post side ------------------------------------------------------

    def record_post_rename(
        self,
        *,
        old_slug: str,
        new_slug: str,
        locale: PostLocale,
        target_post_id: uuid.UUID,
    ) -> None:
        # Step 1: UPSERT (delete + insert keeps SQLite + Postgres parity).
        self.db.execute(
            delete(PostSlugRedirect).where(
                PostSlugRedirect.locale == locale,
                PostSlugRedirect.old_slug == old_slug,
            )
        )
        self.db.add(
            PostSlugRedirect(
                locale=locale,
                old_slug=old_slug,
                target_post_id=target_post_id,
                created_at=datetime.now(timezone.utc),
                last_hit_at=None,
                hit_count=0,
            )
        )
        # Step 2: drop redirects whose old_slug == new_slug (this post just claimed it).
        self.db.execute(
            delete(PostSlugRedirect).where(
                PostSlugRedirect.locale == locale,
                PostSlugRedirect.old_slug == new_slug,
            )
        )
        self.db.flush()

    def claim_post_slug(self, *, slug: str, locale: PostLocale) -> None:
        """Step 2 only: used on post creation when a brand-new slug is claimed."""
        self.db.execute(
            delete(PostSlugRedirect).where(
                PostSlugRedirect.locale == locale,
                PostSlugRedirect.old_slug == slug,
            )
        )
        self.db.flush()

    def lookup_post_redirect(
        self,
        *,
        old_slug: str,
        locale: PostLocale,
        content_kind: PostContentKind,
    ) -> RedirectResolution | None:
        stmt = (
            select(PostSlugRedirect.id, Post.slug)
            .join(Post, Post.id == PostSlugRedirect.target_post_id)
            .where(
                PostSlugRedirect.locale == locale,
                PostSlugRedirect.old_slug == old_slug,
                Post.content_kind == content_kind,
                Post.status == PostStatus.PUBLISHED,
                Post.visibility == PostVisibility.PUBLIC,
            )
        )
        row = self.db.execute(stmt).first()
        if row is None:
            return None
        return RedirectResolution(redirect_id=row[0], target_slug=row[1])

    def record_post_hit(self, *, redirect_id: uuid.UUID) -> None:
        self.db.execute(
            update(PostSlugRedirect)
            .where(PostSlugRedirect.id == redirect_id)
            .values(
                hit_count=PostSlugRedirect.hit_count + 1,
                last_hit_at=datetime.now(timezone.utc),
            )
        )
        self.db.commit()

    def purge_expired_post_redirects(self, *, min_age_days: int, idle_days: int) -> int:
        now = datetime.now(timezone.utc)
        age_cutoff = now - timedelta(days=max(1, min_age_days))
        idle_cutoff = now - timedelta(days=max(1, idle_days))
        stmt = delete(PostSlugRedirect).where(
            PostSlugRedirect.created_at < age_cutoff,
            (PostSlugRedirect.last_hit_at.is_(None))
            | (PostSlugRedirect.last_hit_at < idle_cutoff),
        )
        result = self.db.execute(stmt)
        self.db.commit()
        return int(result.rowcount or 0)

    # ---- Series side ----------------------------------------------------

    def record_series_rename(
        self,
        *,
        old_slug: str,
        new_slug: str,
        locale: PostLocale,
        target_series_id: uuid.UUID,
    ) -> None:
        self.db.execute(
            delete(SeriesSlugRedirect).where(
                SeriesSlugRedirect.locale == locale,
                SeriesSlugRedirect.old_slug == old_slug,
            )
        )
        self.db.add(
            SeriesSlugRedirect(
                locale=locale,
                old_slug=old_slug,
                target_series_id=target_series_id,
                created_at=datetime.now(timezone.utc),
                last_hit_at=None,
                hit_count=0,
            )
        )
        self.db.execute(
            delete(SeriesSlugRedirect).where(
                SeriesSlugRedirect.locale == locale,
                SeriesSlugRedirect.old_slug == new_slug,
            )
        )
        self.db.flush()

    def claim_series_slug(self, *, slug: str, locale: PostLocale) -> None:
        self.db.execute(
            delete(SeriesSlugRedirect).where(
                SeriesSlugRedirect.locale == locale,
                SeriesSlugRedirect.old_slug == slug,
            )
        )
        self.db.flush()

    def lookup_series_redirect(
        self,
        *,
        old_slug: str,
        locale: PostLocale,
    ) -> RedirectResolution | None:
        stmt = (
            select(SeriesSlugRedirect.id, Series.slug)
            .join(Series, Series.id == SeriesSlugRedirect.target_series_id)
            .where(
                SeriesSlugRedirect.locale == locale,
                SeriesSlugRedirect.old_slug == old_slug,
            )
        )
        row = self.db.execute(stmt).first()
        if row is None:
            return None
        return RedirectResolution(redirect_id=row[0], target_slug=row[1])

    def record_series_hit(self, *, redirect_id: uuid.UUID) -> None:
        self.db.execute(
            update(SeriesSlugRedirect)
            .where(SeriesSlugRedirect.id == redirect_id)
            .values(
                hit_count=SeriesSlugRedirect.hit_count + 1,
                last_hit_at=datetime.now(timezone.utc),
            )
        )
        self.db.commit()

    def purge_expired_series_redirects(self, *, min_age_days: int, idle_days: int) -> int:
        now = datetime.now(timezone.utc)
        age_cutoff = now - timedelta(days=max(1, min_age_days))
        idle_cutoff = now - timedelta(days=max(1, idle_days))
        stmt = delete(SeriesSlugRedirect).where(
            SeriesSlugRedirect.created_at < age_cutoff,
            (SeriesSlugRedirect.last_hit_at.is_(None))
            | (SeriesSlugRedirect.last_hit_at < idle_cutoff),
        )
        result = self.db.execute(stmt)
        self.db.commit()
        return int(result.rowcount or 0)
