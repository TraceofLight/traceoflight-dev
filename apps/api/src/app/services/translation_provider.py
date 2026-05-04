from __future__ import annotations

from typing import Protocol


class TranslationProvider(Protocol):
    def translate_post(self, post, target_locale: str): ...


class NoopTranslationProvider:
    def translate_post(self, post, target_locale: str):  # type: ignore[no-untyped-def]
        del post, target_locale
        return None
