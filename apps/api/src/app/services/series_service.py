from __future__ import annotations

from app.repositories.series_repository import SeriesRepository
from app.schemas.series import SeriesUpsert


class SeriesService:
    def __init__(self, repo: SeriesRepository) -> None:
        self.repo = repo

    def list_series(self, include_private: bool = False, limit: int = 50, offset: int = 0):
        return self.repo.list(include_private=include_private, limit=limit, offset=offset)

    def get_series_by_slug(self, slug: str, include_private: bool = False):
        return self.repo.get_by_slug(slug=slug, include_private=include_private)

    def create_series(self, payload: SeriesUpsert):
        result = self.repo.create(payload)
        self.repo.db.commit()
        return result

    def update_series_by_slug(self, slug: str, payload: SeriesUpsert):
        result = self.repo.update_by_slug(current_slug=slug, payload=payload)
        if result is None:
            return None
        self.repo.db.commit()
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
