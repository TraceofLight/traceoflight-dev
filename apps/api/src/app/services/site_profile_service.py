from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

from app.repositories.site_profile_repository import SiteProfileRepository

DEFAULT_SITE_PROFILE_EMAIL = "rickyjun96@gmail.com"
DEFAULT_SITE_PROFILE_GITHUB_URL = "https://github.com/TraceofLight"


@dataclass(frozen=True)
class SiteProfileResult:
    email: str
    github_url: str


class SiteProfileService:
    def __init__(self, repo: SiteProfileRepository) -> None:
        self.repo = repo

    def get_profile(self) -> SiteProfileResult:
        profile = self.repo.get_default()
        if profile is None:
            return SiteProfileResult(
                email=DEFAULT_SITE_PROFILE_EMAIL,
                github_url=DEFAULT_SITE_PROFILE_GITHUB_URL,
            )

        return SiteProfileResult(
            email=profile.email,
            github_url=profile.github_url,
        )

    def update_profile(self, email: str, github_url: str) -> SiteProfileResult:
        normalized_email = self._normalize_email(email)
        normalized_github_url = self._normalize_github_url(github_url)
        saved = self.repo.save_default(
            email=normalized_email,
            github_url=normalized_github_url,
        )
        self.repo.db.commit()
        return SiteProfileResult(
            email=saved.email,
            github_url=saved.github_url,
        )

    def _normalize_email(self, email: str) -> str:
        normalized_email = email.strip()
        if not normalized_email:
            raise ValueError("email is required")
        if any(char.isspace() for char in normalized_email):
            raise ValueError("email must not contain whitespace")

        local_part, separator, domain = normalized_email.partition("@")
        if not separator or not local_part or not domain or "." not in domain:
            raise ValueError("email must be a valid address")

        return normalized_email

    def _normalize_github_url(self, github_url: str) -> str:
        normalized_github_url = github_url.strip()
        if not normalized_github_url:
            raise ValueError("github_url is required")

        parsed = urlparse(normalized_github_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("github_url must be an absolute http or https URL")

        return normalized_github_url
