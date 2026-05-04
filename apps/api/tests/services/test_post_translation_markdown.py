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
