from __future__ import annotations

from dataclasses import dataclass
import uuid

from app.services.post_translation_service import PostTranslationService
from app.services.translation_provider import NoopTranslationProvider


@dataclass
class _PostStub:
    slug: str
    title: str
    excerpt: str | None
    body_markdown: str
    locale: str
    source_post_id: uuid.UUID | None = None


class _ProviderStub:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.bodies: list[str] = []

    def translate_post(self, post, target_locale: str):  # type: ignore[no-untyped-def]
        self.calls.append((post.slug, target_locale))
        self.bodies.append(post.body_markdown)
        return {"slug": f"{post.slug}-{target_locale}", "locale": target_locale}


def test_post_translation_service_targets_en_ja_zh_for_korean_source_posts() -> None:
    provider = _ProviderStub()
    service = PostTranslationService(provider=provider)

    results = service.sync_source_post(
        _PostStub(
            slug="hello-world",
            title="Hello World",
            excerpt="excerpt",
            body_markdown="body",
            locale="ko",
        )
    )

    assert provider.calls == [
        ("hello-world", "en"),
        ("hello-world", "ja"),
        ("hello-world", "zh"),
    ]
    assert len(results) == 3


def test_post_translation_service_masks_body_markdown_before_provider_call() -> None:
    provider = _ProviderStub()
    service = PostTranslationService(provider=provider)

    service.sync_source_post(
        _PostStub(
            slug="hello-world",
            title="Hello World",
            excerpt="excerpt",
            body_markdown='본문 [링크](https://example.com) 와 `const value = 1`',
            locale="ko",
        )
    )

    assert provider.bodies
    assert "https://example.com" not in provider.bodies[0]
    assert "const value = 1" not in provider.bodies[0]
    assert "@@TLP" in provider.bodies[0]


def test_post_translation_service_skips_non_source_posts() -> None:
    provider = _ProviderStub()
    service = PostTranslationService(provider=provider)

    translated_results = service.sync_source_post(
        _PostStub(
            slug="hello-world-en",
            title="Hello World",
            excerpt="excerpt",
            body_markdown="body",
            locale="en",
        )
    )
    child_results = service.sync_source_post(
        _PostStub(
            slug="hello-world-ja",
            title="Hello World",
            excerpt="excerpt",
            body_markdown="body",
            locale="ko",
            source_post_id=uuid.uuid4(),
        )
    )

    assert translated_results == []
    assert child_results == []
    assert provider.calls == []


def test_post_translation_service_noop_provider_returns_no_translations() -> None:
    service = PostTranslationService(provider=NoopTranslationProvider())

    results = service.sync_source_post(
        _PostStub(
            slug="hello-world",
            title="Hello World",
            excerpt="excerpt",
            body_markdown="body",
            locale="ko",
        )
    )

    assert results == []
