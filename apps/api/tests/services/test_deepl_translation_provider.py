from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import MagicMock

import pytest

from app.services.deepl_translation_provider import (
    DeeplTranslationProvider,
    UnsupportedTargetLocaleError,
)


@dataclass
class _Post:
    title: str
    excerpt: str | None
    body_markdown: str


def _stub_translator(translations: dict[tuple[str, str], str]) -> MagicMock:
    """Return a mock that mimics deepl.Translator.translate_text."""

    def translate_text(text, *, source_lang, target_lang, **_kwargs):
        result = MagicMock()
        result.text = translations[(text, target_lang)]
        return result

    translator = MagicMock()
    translator.translate_text.side_effect = translate_text
    return translator


def test_translate_post_calls_deepl_with_correct_target_codes() -> None:
    translator = _stub_translator(
        {
            ("Hello", "EN-US"): "Hello!",
            ("Lead", "EN-US"): "Lead!",
            ("body", "EN-US"): "Body!",
        }
    )
    provider = DeeplTranslationProvider(api_key="stub", _client=translator)

    result = provider.translate_post(
        _Post(title="Hello", excerpt="Lead", body_markdown="body"),
        target_locale="en",
    )

    assert result == {
        "title": "Hello!",
        "excerpt": "Lead!",
        "body_markdown": "Body!",
    }
    calls = translator.translate_text.call_args_list
    assert len(calls) == 3
    for call in calls:
        assert call.kwargs["source_lang"] == "KO"
        assert call.kwargs["target_lang"] == "EN-US"


def test_translate_post_maps_target_codes_for_each_supported_locale() -> None:
    cases = {
        "en": "EN-US",
        "ja": "JA",
        "zh": "ZH",
    }
    for short, expected_target in cases.items():
        translator = _stub_translator({("t", expected_target): "T"})
        provider = DeeplTranslationProvider(api_key="stub", _client=translator)
        result = provider.translate_post(
            _Post(title="t", excerpt=None, body_markdown="t"),
            target_locale=short,
        )
        assert result is not None
        assert translator.translate_text.call_args.kwargs["target_lang"] == expected_target


def test_translate_post_skips_excerpt_when_none() -> None:
    translator = _stub_translator(
        {("title", "EN-US"): "T", ("body", "EN-US"): "B"}
    )
    provider = DeeplTranslationProvider(api_key="stub", _client=translator)

    result = provider.translate_post(
        _Post(title="title", excerpt=None, body_markdown="body"),
        target_locale="en",
    )

    assert result == {"title": "T", "excerpt": None, "body_markdown": "B"}
    assert translator.translate_text.call_count == 2


def test_translate_post_raises_for_unknown_target_locale() -> None:
    translator = _stub_translator({})
    provider = DeeplTranslationProvider(api_key="stub", _client=translator)

    with pytest.raises(UnsupportedTargetLocaleError):
        provider.translate_post(
            _Post(title="t", excerpt=None, body_markdown="b"),
            target_locale="ko",  # source locale, not a target
        )
