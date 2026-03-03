from __future__ import annotations

from app.repositories.post_repository import PostRepository
from app.schemas.post import PostCreate


class PostService:
    def __init__(self, repo: PostRepository) -> None:
        self.repo = repo

    def list_posts(self, limit: int = 20, offset: int = 0):
        return self.repo.list(limit=limit, offset=offset)

    def create_post(self, payload: PostCreate):
        return self.repo.create(payload)