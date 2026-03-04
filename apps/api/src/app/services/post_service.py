from __future__ import annotations

from app.models.post import PostStatus, PostVisibility
from app.repositories.post_repository import PostRepository
from app.schemas.post import PostCreate


class PostService:
    def __init__(self, repo: PostRepository) -> None:
        self.repo = repo

    def list_posts(
        self,
        limit: int = 20,
        offset: int = 0,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
    ):
        return self.repo.list(limit=limit, offset=offset, status=status, visibility=visibility)

    def get_post_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
    ):
        return self.repo.get_by_slug(slug=slug, status=status, visibility=visibility)

    def create_post(self, payload: PostCreate):
        return self.repo.create(payload)

    def update_post_by_slug(self, slug: str, payload: PostCreate):
        return self.repo.update_by_slug(current_slug=slug, payload=payload)

    def delete_post_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
    ) -> bool:
        return self.repo.delete_by_slug(slug=slug, status=status, visibility=visibility)
