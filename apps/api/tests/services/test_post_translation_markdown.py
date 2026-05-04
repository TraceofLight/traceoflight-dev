from __future__ import annotations

from app.services.post_translation_markdown import (
    mask_markdown_translation_segments,
    unmask_markdown_translation_segments,
)


def test_mask_markdown_translation_segments_protects_non_translatable_ranges() -> None:
    markdown = """
# Title

Inline `const value = 1` here.

```ts
console.log("hello");
```

[guide](https://example.com/docs?q=1)
![cover](/media/image/cover.png)
https://traceoflight.dev/blog/test
<iframe src="https://www.youtube.com/embed/abc"></iframe>
""".strip()

    masked = mask_markdown_translation_segments(markdown)

    assert "const value = 1" not in masked.text
    assert 'console.log("hello");' not in masked.text
    assert "https://example.com/docs?q=1" not in masked.text
    assert "/media/image/cover.png" not in masked.text
    assert "https://traceoflight.dev/blog/test" not in masked.text
    assert '<iframe src="https://www.youtube.com/embed/abc"></iframe>' not in masked.text
    assert '<x-tlp i="0"/>' in masked.text


def test_unmask_markdown_translation_segments_restores_original_content() -> None:
    markdown = """
본문 [링크](https://example.com) 와 `inline code`

```py
print("hello")
```
""".strip()

    masked = mask_markdown_translation_segments(markdown)
    restored = unmask_markdown_translation_segments(masked.text, masked.replacements)

    assert restored == markdown


def test_placeholder_format_is_xml_element() -> None:
    """Placeholder must be an XML element so DeepL preserves it via tag_handling='xml'."""
    markdown = "Hello ![alt](https://example.com/img.png) `code` world"
    masked = mask_markdown_translation_segments(markdown)
    # All placeholders must use the x-tlp XML format
    for key in masked.replacements:
        assert key.startswith("<x-tlp "), f"unexpected placeholder format: {key!r}"
        assert key.endswith("/>"), f"placeholder must be self-closing: {key!r}"


def test_mask_unmask_roundtrip_preserves_placeholders() -> None:
    """Mask → simulate DeepL verbatim passthrough → unmask must recover original."""
    original = "Hello ![alt](https://example.com/img.png) `code` world"
    masked = mask_markdown_translation_segments(original)
    # Simulate DeepL preserving the XML tags verbatim (tag_handling="xml")
    translated_text = masked.text  # DeepL returns tags unchanged
    restored = unmask_markdown_translation_segments(translated_text, masked.replacements)
    assert restored == original


def test_mask_protects_blockquote_line_markers() -> None:
    """`>` blockquote prefixes are bare angle-bracket characters — DeepL's
    HTML/XML tag handling can drop or relocate them. Mask the line-leading
    markers so translations preserve blockquote structure regardless of
    target locale."""
    markdown = "> 첫 번째 인용문\n>> 중첩 인용\n   > 들여쓴 인용\n일반 단락"

    masked = mask_markdown_translation_segments(markdown)

    # The bare `>` markers must be replaced by placeholders before DeepL sees them.
    assert "> 첫 번째" not in masked.text
    assert "> 중첩" not in masked.text
    assert "> 들여쓴" not in masked.text
    # But the body text content remains visible for translation.
    assert "첫 번째 인용문" in masked.text
    assert "중첩 인용" in masked.text
    assert "들여쓴 인용" in masked.text
    assert "일반 단락" in masked.text


def test_mask_unmask_roundtrip_preserves_blockquote_structure() -> None:
    original = (
        "> 인용 한 줄\n"
        ">> 두 단계 들여쓰기\n"
        "   > 공백 들여쓰기\n"
        "그 다음 단락"
    )
    masked = mask_markdown_translation_segments(original)
    restored = unmask_markdown_translation_segments(masked.text, masked.replacements)
    assert restored == original


def test_mask_does_not_touch_inline_greater_than() -> None:
    """Mid-line `>` (e.g. comparison operators in prose) must NOT be masked —
    only line-leading blockquote markers."""
    markdown = "값이 10 > 5 일 때"
    masked = mask_markdown_translation_segments(markdown)
    assert masked.text == markdown
    assert masked.replacements == {}
