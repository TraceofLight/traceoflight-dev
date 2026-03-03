from __future__ import annotations

from app.models.post import PostStatus
from app.repositories.post_repository import PostRepository
from app.schemas.post import PostCreate


class PostService:
    def __init__(self, repo: PostRepository) -> None:
        self.repo = repo

    def list_posts(self, limit: int = 20, offset: int = 0, status: PostStatus | None = None):
        return self.repo.list(limit=limit, offset=offset, status=status)

    def get_post_by_slug(self, slug: str, status: PostStatus | None = None):
        return self.repo.get_by_slug(slug=slug, status=status)

    def create_post(self, payload: PostCreate):
        return self.repo.create(payload)
