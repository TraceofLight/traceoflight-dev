//! Source-content hash for skip-if-unchanged in the translation worker.
//!
//! sha256 over the translatable fields, joined by an ASCII unit separator
//! (`\x1f`) that never appears in user content. Excluded fields (cover,
//! published_at, status, etc.) intentionally don't trigger re-translation.

use sha2::{Digest, Sha256};

const FIELD_SEPARATOR: char = '\x1f';

pub fn hash_post(title: &str, excerpt: Option<&str>, body_markdown: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(title.as_bytes());
    hasher.update([FIELD_SEPARATOR as u8]);
    hasher.update(excerpt.unwrap_or("").as_bytes());
    hasher.update([FIELD_SEPARATOR as u8]);
    hasher.update(body_markdown.as_bytes());
    let bytes = hasher.finalize();
    let mut hex = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(hex, "{:02x}", b);
    }
    hex
}

pub fn hash_series(title: &str, description: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(title.as_bytes());
    hasher.update([FIELD_SEPARATOR as u8]);
    hasher.update(description.as_bytes());
    let bytes = hasher.finalize();
    let mut hex = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(hex, "{:02x}", b);
    }
    hex
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_post_deterministic_for_same_input() {
        let a = hash_post("Hello", Some("Greeting"), "Body");
        let b = hash_post("Hello", Some("Greeting"), "Body");
        assert_eq!(a, b);
    }

    #[test]
    fn hash_post_changes_when_title_changes() {
        let a = hash_post("Hello", Some("Greeting"), "Body");
        let b = hash_post("Hi", Some("Greeting"), "Body");
        assert_ne!(a, b);
    }

    #[test]
    fn hash_post_changes_when_excerpt_changes() {
        let a = hash_post("Hello", Some("Greeting"), "Body");
        let b = hash_post("Hello", Some("Hail"), "Body");
        assert_ne!(a, b);
    }

    #[test]
    fn hash_post_changes_when_body_changes() {
        let a = hash_post("Hello", Some("Greeting"), "Body");
        let b = hash_post("Hello", Some("Greeting"), "Different body");
        assert_ne!(a, b);
    }

    #[test]
    fn hash_post_treats_none_excerpt_same_as_empty_excerpt() {
        // Documents the convention so future refactors don't break the
        // skip-if-unchanged contract for posts that lose their excerpt.
        assert_eq!(
            hash_post("t", None, "b"),
            hash_post("t", Some(""), "b"),
        );
    }

    #[test]
    fn hash_uses_field_separator_to_prevent_collisions() {
        // Without the separator, ("ab", "c") and ("a", "bc") would hash the
        // same. The 0x1f separator ensures they don't.
        let collide_a = hash_post("ab", Some("c"), "body");
        let collide_b = hash_post("a", Some("bc"), "body");
        assert_ne!(collide_a, collide_b);
    }

    #[test]
    fn hash_series_deterministic() {
        let a = hash_series("Title", "Desc");
        let b = hash_series("Title", "Desc");
        assert_eq!(a, b);
    }

    #[test]
    fn hash_series_distinct_from_post_hash() {
        // A series with empty body shouldn't collide with a post that has
        // the same title+empty-excerpt+empty-body.
        let post = hash_post("Title", Some(""), "");
        let series = hash_series("Title", "");
        // They might happen to match if joined identically; verify the
        // produced hex differs because the series helper uses 2 fields,
        // post helper uses 3 (separator count differs).
        assert_ne!(post, series);
    }
}
