from __future__ import annotations

from app.models.post import PostLocale
from app.repositories.series_repository import SeriesRepository
from app.schemas.series import SeriesUpsert
from app.services.series_translation_service import SeriesTranslationService


class SeriesService:
    def __init__(
        self,
        repo: SeriesRepository,
        translation_service: SeriesTranslationService | None = None,
    ) -> None:
        self.repo = repo
        self.translation_service = translation_service

    def _sync_translations(self, series) -> None:  # type: ignore[no-untyped-def]
        if self.translation_service is None:
            return
        locale_obj = getattr(series, "locale", None)
        locale_raw = getattr(locale_obj, "value", locale_obj)
        locale = str(locale_raw or "").strip().lower()
        source_series_id = getattr(series, "source_series_id", None)
        if locale != "ko" or source_series_id is not None:
            return
        try:
            self.translation_service.sync_source_series(series)
        except Exception:  # noqa: BLE001 — translation failures must not block source save
            return

    def list_series(
        self,
        include_private: bool = False,
        limit: int = 50,
        offset: int = 0,
        locale: PostLocale | None = None,
    ):
        return self.repo.list(
            include_private=include_private,
            limit=limit,
            offset=offset,
            locale=locale,
        )

    def list_admin_sources(self):
        """Returns Korean source series rows only, for admin reorder UI."""
        return self.repo.list_admin_sources()

    def get_series_by_slug(
        self,
        slug: str,
        include_private: bool = False,
        locale: PostLocale | None = None,
    ):
        return self.repo.get_by_slug(
            slug=slug,
            include_private=include_private,
            locale=locale,
        )

    def create_series(self, payload: SeriesUpsert):
        result = self.repo.create(payload)
        self.repo.db.commit()
        self._sync_translations(result)
        return result

    def update_series_by_slug(self, slug: str, payload: SeriesUpsert):
        result = self.repo.update_by_slug(current_slug=slug, payload=payload)
        if result is None:
            return None
        self.repo.db.commit()
        self._sync_translations(result)
        return result

    def delete_series_by_slug(self, slug: str) -> bool:
        deleted = self.repo.delete_by_slug(slug)
        if deleted:
            self.repo.db.commit()
        return deleted

    def replace_series_posts_by_slug(self, slug: str, post_slugs: list[str]):
        result = self.repo.replace_posts_by_slug(slug=slug, raw_post_slugs=post_slugs)
        if result is None:
            return None
        self.repo.db.commit()
        return result

    def replace_series_order(self, series_slugs: list[str]):
        result = self.repo.replace_series_order(series_slugs)
        self.repo.db.commit()
        return result
