from __future__ import annotations

from app.repositories.tag_repository import TagRepository, normalize_tag_slug
from app.schemas.tag import TagCreate, TagUpdate


class TagValidationError(ValueError):
    pass


class TagInUseError(RuntimeError):
    pass


class TagService:
    def __init__(self, repo: TagRepository) -> None:
        self.repo = repo

    def list_tags(self, query: str | None = None, limit: int = 50, offset: int = 0):
        return self.repo.list(query=query, limit=limit, offset=offset)

    def create_tag(self, payload: TagCreate):
        slug = normalize_tag_slug(payload.slug)
        label = payload.label.strip()
        if not slug:
            raise TagValidationError("tag slug is invalid")
        if not label:
            raise TagValidationError("tag label is required")

        created = self.repo.create(slug=slug, label=label)
        self.repo.db.commit()
        self.repo.db.refresh(created)
        return created

    def update_tag(self, current_slug: str, payload: TagUpdate):
        tag = self.repo.get_by_slug(current_slug)
        if tag is None:
            return None

        next_slug = normalize_tag_slug(payload.slug) if payload.slug is not None else tag.slug
        next_label = payload.label.strip() if payload.label is not None else tag.label
        if not next_slug:
            raise TagValidationError("tag slug is invalid")
        if not next_label:
            raise TagValidationError("tag label is required")

        tag.slug = next_slug
        tag.label = next_label
        self.repo.db.commit()
        self.repo.db.refresh(tag)
        return tag

    def delete_tag(self, slug: str, force: bool = False) -> bool:
        tag = self.repo.get_by_slug(slug)
        if tag is None:
            return False

        if not force and self.repo.count_post_links(tag.id) > 0:
            raise TagInUseError("tag is linked to one or more posts")

        if force:
            tag.posts.clear()
            self.repo.db.flush()

        self.repo.delete(tag)
        self.repo.db.commit()
        return True
