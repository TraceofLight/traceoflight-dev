"""DeepL-backed translation provider conforming to the TranslationProvider Protocol."""

from __future__ import annotations

from typing import Any


_DEEPL_TARGET_BY_LOCALE = {
    "en": "EN-US",
    "ja": "JA",
    "zh": "ZH",
}


class UnsupportedTargetLocaleError(ValueError):
    """Raised when a target locale isn't in the DeepL target map."""


class DeeplTranslationProvider:
    """Adapter around the deepl SDK that translates the three translatable
    fields of a post (title, excerpt, body_markdown). Excerpt is optional.

    The provider expects already-masked markdown for body_markdown — masking
    and unmasking are owned by the worker, not this adapter.
    """

    def __init__(self, api_key: str, *, _client: Any | None = None) -> None:
        if _client is not None:
            self._client = _client
            return
        # Lazy import so that pytest collection doesn't pull the SDK when the
        # provider isn't actually being used.
        import deepl  # type: ignore[import-untyped]

        self._client = deepl.Translator(api_key)

    def translate_post(self, post: Any, target_locale: str) -> dict[str, Any] | None:
        target = _DEEPL_TARGET_BY_LOCALE.get(target_locale)
        if target is None:
            raise UnsupportedTargetLocaleError(
                f"target_locale {target_locale!r} not in {sorted(_DEEPL_TARGET_BY_LOCALE)}"
            )

        title = self._translate(post.title, target)
        excerpt = self._translate(post.excerpt, target) if post.excerpt else None
        body = self._translate(post.body_markdown, target)
        return {
            "title": title,
            "excerpt": excerpt,
            "body_markdown": body,
        }

    def _translate(self, text: str, target_lang: str) -> str:
        result = self._client.translate_text(
            text,
            source_lang="KO",
            target_lang=target_lang,
        )
        return str(result.text)
