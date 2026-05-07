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
