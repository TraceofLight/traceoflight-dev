//! Parse `/media/{key}` references out of URLs and markdown bodies. Used by
//! cleanup to keep media GC and post bodies in sync.

use std::collections::HashSet;

/// Extract the storage object key from a `…/media/{key}` URL or path. Returns
/// `None` for non-media URLs and empty input. Best-effort percent-decode for
/// typical slug-shaped keys; full RFC 3986 decoding is unnecessary because
/// stored keys are slug-only.
pub fn extract_object_key(raw: Option<&str>) -> Option<String> {
    let trimmed = raw?.trim();
    if trimmed.is_empty() {
        return None;
    }
    let path = if let Some(scheme_end) = trimmed.find("://") {
        let after_scheme = &trimmed[scheme_end + 3..];
        let path_start = after_scheme.find('/').unwrap_or(after_scheme.len());
        &after_scheme[path_start..]
    } else {
        trimmed
    };
    let idx = path.find("/media/")?;
    let key_raw = path[idx + "/media/".len()..].trim_start_matches('/');
    if key_raw.is_empty() {
        return None;
    }
    Some(percent_decode(key_raw))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_nibble(bytes[i + 1]), hex_nibble(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Pull every `…/media/{key}` reference from a markdown blob, deduped while
/// preserving first-seen order.
pub fn extract_markdown_keys(markdown: &str) -> Vec<String> {
    use regex::Regex;
    use std::sync::OnceLock;
    static RE: OnceLock<Regex> = OnceLock::new();
    let pattern = RE.get_or_init(|| {
        Regex::new(r#"(?:https?://[^\s"')>]+/media/[^\s"')>]+|/media/[^\s"')>]+)"#).unwrap()
    });
    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<String> = Vec::new();
    for cap in pattern.find_iter(markdown) {
        if let Some(key) = extract_object_key(Some(cap.as_str())) {
            if seen.insert(key.clone()) {
                out.push(key);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── extract_object_key ───────────────────────────────────────────────────

    #[test]
    fn extract_object_key_returns_none_for_missing_or_blank_input() {
        assert_eq!(extract_object_key(None), None);
        assert_eq!(extract_object_key(Some("")), None);
        assert_eq!(extract_object_key(Some("   ")), None);
    }

    #[test]
    fn extract_object_key_returns_none_for_non_media_url() {
        assert_eq!(extract_object_key(Some("https://example.com/foo.jpg")), None);
        assert_eq!(extract_object_key(Some("/posts/abc")), None);
    }

    #[test]
    fn extract_object_key_handles_plain_path() {
        assert_eq!(
            extract_object_key(Some("/media/cover.jpg")),
            Some("cover.jpg".into())
        );
    }

    #[test]
    fn extract_object_key_handles_full_url_with_scheme() {
        assert_eq!(
            extract_object_key(Some("https://cdn.example.com/media/cover.jpg")),
            Some("cover.jpg".into())
        );
    }

    #[test]
    fn extract_object_key_keeps_subpath_after_media_prefix() {
        assert_eq!(
            extract_object_key(Some("/media/image/2026/cover.jpg")),
            Some("image/2026/cover.jpg".into())
        );
    }

    #[test]
    fn extract_object_key_returns_none_when_key_segment_is_empty() {
        assert_eq!(extract_object_key(Some("/media/")), None);
        assert_eq!(extract_object_key(Some("/media//")), None);
    }

    #[test]
    fn extract_object_key_percent_decodes_typical_keys() {
        assert_eq!(
            extract_object_key(Some("/media/hello%20world.jpg")),
            Some("hello world.jpg".into())
        );
    }

    #[test]
    fn extract_object_key_strips_leading_slashes_after_prefix() {
        // Defensive: doubled slash from a careless template still resolves.
        assert_eq!(
            extract_object_key(Some("https://x/media//foo.jpg")),
            Some("foo.jpg".into())
        );
    }

    // ── extract_markdown_keys ────────────────────────────────────────────────

    #[test]
    fn extract_markdown_keys_returns_empty_for_no_references() {
        assert!(extract_markdown_keys("plain text with [link](https://example.com)").is_empty());
    }

    #[test]
    fn extract_markdown_keys_pulls_image_link() {
        let md = "![cover](https://cdn.x/media/cover.jpg)";
        assert_eq!(extract_markdown_keys(md), vec!["cover.jpg"]);
    }

    #[test]
    fn extract_markdown_keys_pulls_relative_path_reference() {
        let md = "see /media/raw/foo.png inline";
        assert_eq!(extract_markdown_keys(md), vec!["raw/foo.png"]);
    }

    #[test]
    fn extract_markdown_keys_dedupes_and_preserves_first_seen_order() {
        let md = "\
            ![a](https://x/media/a.jpg)\n\
            ![b](https://x/media/b.jpg)\n\
            ![a-again](https://x/media/a.jpg)";
        assert_eq!(extract_markdown_keys(md), vec!["a.jpg", "b.jpg"]);
    }

    #[test]
    fn extract_markdown_keys_finds_html_src_attributes() {
        let md = r#"<img src="/media/foo.png" alt="x" />"#;
        assert_eq!(extract_markdown_keys(md), vec!["foo.png"]);
    }

    #[test]
    fn extract_markdown_keys_ignores_non_media_links() {
        let md = "![x](https://example.com/img.png) and ![y](/media/keep.png)";
        assert_eq!(extract_markdown_keys(md), vec!["keep.png"]);
    }
}
