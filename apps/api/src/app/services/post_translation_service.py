from __future__ import annotations

from dataclasses import replace

from app.services.post_translation_markdown import mask_markdown_translation_segments
from app.services.translation_provider import TranslationProvider

TARGET_TRANSLATION_LOCALES = ("en", "ja", "zh")


class PostTranslationService:
    def __init__(self, provider: TranslationProvider) -> None:
        self.provider = provider

    def sync_source_post(self, post):  # type: ignore[no-untyped-def]
        locale = str(getattr(post, "locale", "") or "").strip().lower()
        source_post_id = getattr(post, "source_post_id", None)
        if locale != "ko" or source_post_id is not None:
            return []

        results: list[object] = []
        masked_post = post
        if hasattr(post, "body_markdown"):
            masked = mask_markdown_translation_segments(getattr(post, "body_markdown", ""))
            if hasattr(post, "__dataclass_fields__"):
                masked_post = replace(post, body_markdown=masked.text)
            else:
                setattr(post, "body_markdown", masked.text)
                masked_post = post
        for target_locale in TARGET_TRANSLATION_LOCALES:
            translated = self.provider.translate_post(masked_post, target_locale)
            if translated is None:
                continue
            results.append(translated)
        return results
