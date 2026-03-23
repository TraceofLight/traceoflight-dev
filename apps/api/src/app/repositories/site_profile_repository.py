from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.site_profile import DEFAULT_SITE_PROFILE_KEY, SiteProfile


class SiteProfileRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_default(self) -> SiteProfile | None:
        return self.db.scalar(
            select(SiteProfile).where(SiteProfile.key == DEFAULT_SITE_PROFILE_KEY)
        )

    def save_default(
        self,
        *,
        email: str,
        github_url: str,
    ) -> SiteProfile:
        profile = self.get_default()
        if profile is None:
            profile = SiteProfile(
                key=DEFAULT_SITE_PROFILE_KEY,
                email=email,
                github_url=github_url,
            )
            self.db.add(profile)
            self.db.flush()
            return profile

        profile.email = email
        profile.github_url = github_url
        self.db.flush()
        return profile
