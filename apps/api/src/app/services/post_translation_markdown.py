from __future__ import annotations

from dataclasses import dataclass
import re


@dataclass(frozen=True)
class MaskedMarkdown:
    text: str
    replacements: dict[str, str]


_FENCED_CODE_PATTERN = re.compile(r"```[\s\S]*?```")
_INLINE_CODE_PATTERN = re.compile(r"`[^`\n]+`")
_MEDIA_TAG_PATTERN = re.compile(r"<(?:iframe|video|audio|source|img)\b[^>]*>(?:</(?:iframe|video|audio)>)?", re.IGNORECASE)
_MARKDOWN_IMAGE_PATTERN = re.compile(r"!\[[^\]]*]\([^)]+\)")
_MARKDOWN_LINK_DESTINATION_PATTERN = re.compile(r"(?P<prefix>\[[^\]]*]\()(?P<target>[^)]+)(?P<suffix>\))")
_BARE_URL_PATTERN = re.compile(r"(?P<url>https?://[^\s)>\]]+)")
# Blockquote line markers (>, >>, > >, with optional 0-3 space indent and a
# trailing single space). Masked per line so DeepL's HTML/XML tag handling
# can't drop or relocate the bare `>` characters during translation.
_BLOCKQUOTE_LINE_PATTERN = re.compile(r"(?m)^(?P<indent>[ ]{0,3})(?P<markers>(?:>[ \t]?)+)")


def _placeholder(index: int) -> str:
    return f'<x-tlp i="{index}"/>'


def _replace_pattern(text: str, pattern: re.Pattern[str], replacements: dict[str, str], *, group_name: str | None = None) -> str:
    def replacer(match: re.Match[str]) -> str:
        key = _placeholder(len(replacements))
        if group_name is None:
            replacements[key] = match.group(0)
            return key

        replacements[key] = match.group(group_name)
        return f"{match.group('prefix')}{key}{match.group('suffix')}"

    return pattern.sub(replacer, text)


def mask_markdown_translation_segments(markdown: str) -> MaskedMarkdown:
    text = str(markdown)
    replacements: dict[str, str] = {}
    text = _replace_pattern(text, _FENCED_CODE_PATTERN, replacements)
    text = _replace_pattern(text, _MEDIA_TAG_PATTERN, replacements)
    text = _replace_pattern(text, _MARKDOWN_IMAGE_PATTERN, replacements)
    text = _replace_pattern(text, _INLINE_CODE_PATTERN, replacements)
    text = _replace_pattern(
        text,
        _MARKDOWN_LINK_DESTINATION_PATTERN,
        replacements,
        group_name="target",
    )
    text = _replace_pattern(text, _BARE_URL_PATTERN, replacements)
    text = _replace_pattern(text, _BLOCKQUOTE_LINE_PATTERN, replacements)
    return MaskedMarkdown(text=text, replacements=replacements)


def unmask_markdown_translation_segments(
    text: str,
    replacements: dict[str, str],
) -> str:
    restored = str(text)
    for placeholder, original in replacements.items():
        restored = restored.replace(placeholder, original)
    return restored
