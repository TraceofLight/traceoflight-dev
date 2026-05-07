//! Replace non-translatable markdown segments with placeholder tokens
//! before sending to the translation provider, then restore the
//! placeholders afterwards.
//!
//! Without masking, Google Translate (v2/`format=text`) corrupts code
//! fences and bare URLs while preserving link/image syntax acceptably.
//! Empirically observed:
//!   - ` ```rust\nfn main(){}\n``` ` → `` ` ust\n... ``  (fence mangled,
//!     `rust` interpreted as English prose)
//!   - `[공식 문서](https://x)` → `[official documentation](https://x)`
//!     (translation works correctly without masking)
//!   - bare `https://...` URLs may get prose treatment when adjacent to
//!     Korean content
//!
//! Strategy: mask code (fenced + inline), HTML tags, image syntax (whole),
//! and URLs (in links + bare). Link text stays unmasked so it can be
//! translated.

use std::sync::OnceLock;

use regex::{Captures, Regex};

/// Token used in place of masked segments. Uppercase ASCII without spaces
/// or punctuation passes through Google Translate `format=text` as-is in
/// every empirical test we've run; the 5-digit zero-padded index keeps
/// `MDMASK00010` from sharing a prefix with `MDMASK00001` so naive string
/// replace during unmask is safe.
const PLACEHOLDER_PREFIX: &str = "MDMASK";
const PLACEHOLDER_DIGITS: usize = 5;

pub struct Masked {
    pub text: String,
    pub segments: Vec<String>,
}

pub fn mask(input: &str) -> Masked {
    let mut segments: Vec<String> = Vec::new();
    let mut working = input.to_string();

    // 1. Fenced code blocks first — they may contain backticks, links,
    //    HTML, or anything else that other rules would otherwise grab.
    static FENCE: OnceLock<Regex> = OnceLock::new();
    let re = FENCE.get_or_init(|| Regex::new(r"(?s)```[\s\S]*?```").unwrap());
    working = mask_full_match(re, &working, &mut segments);

    // 2. Inline code.
    static INLINE: OnceLock<Regex> = OnceLock::new();
    let re = INLINE.get_or_init(|| Regex::new(r"`[^`\n]+`").unwrap());
    working = mask_full_match(re, &working, &mut segments);

    // 3. Markdown image — full mask (alt-text translation isn't worth
    //    risking URL or filename mangling for a personal blog).
    static IMAGE: OnceLock<Regex> = OnceLock::new();
    let re = IMAGE.get_or_init(|| Regex::new(r"!\[[^\]]*\]\([^)]+\)").unwrap());
    working = mask_full_match(re, &working, &mut segments);

    // 4. Link `[text](url)` — keep [text] translatable, mask URL only.
    static LINK: OnceLock<Regex> = OnceLock::new();
    let re = LINK.get_or_init(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap());
    working = re
        .replace_all(&working, |caps: &Captures<'_>| {
            let text = &caps[1];
            let url = &caps[2];
            let placeholder = next_placeholder(&mut segments, url.to_string());
            format!("[{text}]({placeholder})")
        })
        .into_owned();

    // 5. HTML tags — defensive; Google may otherwise translate attribute
    //    values or the tag name as English prose.
    static HTML: OnceLock<Regex> = OnceLock::new();
    let re = HTML.get_or_init(|| Regex::new(r"<[^>\n]+>").unwrap());
    working = mask_full_match(re, &working, &mut segments);

    // 6. Bare URLs not already inside a link.
    static URL: OnceLock<Regex> = OnceLock::new();
    let re = URL.get_or_init(|| Regex::new(r#"https?://[^\s)\]"]+"#).unwrap());
    working = mask_full_match(re, &working, &mut segments);

    Masked {
        text: working,
        segments,
    }
}

pub fn unmask(translated: &str, segments: &[String]) -> String {
    let mut output = translated.to_string();
    // Reverse so MDMASK00010 isn't partially matched by MDMASK00001's
    // replacement loop (would corrupt index if we went forward).
    for (idx, segment) in segments.iter().enumerate().rev() {
        let placeholder = format_placeholder(idx);
        output = output.replace(&placeholder, segment);
    }
    output
}

fn mask_full_match(re: &Regex, input: &str, segments: &mut Vec<String>) -> String {
    re.replace_all(input, |caps: &Captures<'_>| {
        next_placeholder(segments, caps[0].to_string())
    })
    .into_owned()
}

fn next_placeholder(segments: &mut Vec<String>, segment: String) -> String {
    let idx = segments.len();
    segments.push(segment);
    format_placeholder(idx)
}

fn format_placeholder(idx: usize) -> String {
    format!("{PLACEHOLDER_PREFIX}{:0width$}", idx, width = PLACEHOLDER_DIGITS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(input: &str) -> String {
        let masked = mask(input);
        unmask(&masked.text, &masked.segments)
    }

    #[test]
    fn plain_text_unchanged() {
        let m = mask("hello world");
        assert_eq!(m.text, "hello world");
        assert!(m.segments.is_empty());
        assert_eq!(roundtrip("hello world"), "hello world");
    }

    #[test]
    fn fenced_code_block_masked_and_restored() {
        let md = "Before\n```rust\nfn main() {}\n```\nAfter";
        let m = mask(md);
        assert!(!m.text.contains("fn main"));
        assert_eq!(m.segments.len(), 1);
        assert_eq!(roundtrip(md), md);
    }

    #[test]
    fn inline_code_masked() {
        let md = "Use `Vec::new()` to allocate.";
        let m = mask(md);
        assert!(!m.text.contains("Vec::new"));
        assert_eq!(roundtrip(md), md);
    }

    #[test]
    fn image_fully_masked() {
        let md = "Look at ![alt text](https://x/img.png)";
        let m = mask(md);
        assert!(!m.text.contains("img.png"));
        assert!(!m.text.contains("alt text"));
        assert_eq!(roundtrip(md), md);
    }

    #[test]
    fn link_text_preserved_url_masked() {
        let md = "See [the docs](https://example.com/path) please";
        let m = mask(md);
        // [text] stays in the masked content so Google can translate it.
        assert!(m.text.contains("the docs"));
        // The URL is replaced with a placeholder.
        assert!(!m.text.contains("example.com"));
        assert_eq!(roundtrip(md), md);
    }

    #[test]
    fn html_tag_masked_inner_text_preserved() {
        let md = "Bold <b>word</b> here";
        let m = mask(md);
        assert!(!m.text.contains("<b>"));
        assert!(!m.text.contains("</b>"));
        // The inner text "word" between the tags is still present and
        // translatable.
        assert!(m.text.contains("word"));
        assert_eq!(roundtrip(md), md);
    }

    #[test]
    fn bare_url_masked() {
        let md = "Visit https://example.com for more.";
        let m = mask(md);
        assert!(!m.text.contains("example.com"));
        assert_eq!(roundtrip(md), md);
    }

    #[test]
    fn link_inside_code_fence_does_not_double_mask() {
        // The fence rule runs first and grabs everything between the
        // backticks as a single segment — no double-masking the link
        // syntax inside.
        let md = "```\nclick [here](url)\n```";
        let m = mask(md);
        assert_eq!(m.segments.len(), 1);
        assert_eq!(roundtrip(md), md);
    }

    #[test]
    fn multiple_segments_distinct_placeholders() {
        let md = "`a` and `b` then ```c``` end";
        let m = mask(md);
        assert_eq!(m.segments.len(), 3);
        // Each placeholder is unique.
        assert!(m.text.contains("MDMASK00000"));
        assert!(m.text.contains("MDMASK00001"));
        assert!(m.text.contains("MDMASK00002"));
        assert_eq!(roundtrip(md), md);
    }

    #[test]
    fn unmask_handles_translated_surroundings() {
        // Simulate a translated body where Google preserved the
        // placeholder but rewrote the surrounding prose.
        let original = "보세요 `code`";
        let m = mask(original);
        // Suppose the provider returns this translation, with our
        // placeholder intact:
        let pretend_translation = format!("Look at {}", &m.text["보세요 ".len()..]);
        let restored = unmask(&pretend_translation, &m.segments);
        assert_eq!(restored, "Look at `code`");
    }

    #[test]
    fn unmask_index_safe_for_double_digits() {
        // Build 12 inline code segments to ensure MDMASK00010 doesn't get
        // partially clobbered by MDMASK00001's replacement.
        let parts: Vec<String> = (0..12).map(|i| format!("`f{i}`")).collect();
        let md = parts.join(" ");
        let m = mask(&md);
        assert_eq!(m.segments.len(), 12);
        assert_eq!(roundtrip(&md), md);
    }
}
