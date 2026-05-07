//! Slug normalization and reading-time estimation.

use std::sync::OnceLock;

/// Derive a series slug from a free-text series title. Non-alphanumeric
/// characters become dashes (collapsed), surrounding dashes are stripped,
/// case is preserved, and an empty result falls back to `"series"`. Note
/// this is *not* the same as [`normalize_tag_slug`]: tag slugs are also
/// lowercased.
pub fn slugify_series_title(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut last_dash = false;
    for ch in title.trim().chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "series".into()
    } else {
        trimmed
    }
}

/// Canonical tag-slug shape used by both filtering and storage:
/// trim → lowercase → underscores and whitespace become dashes → drop non-
/// alphanumerics → collapse multi-dash → strip surrounding dashes.
pub fn normalize_tag_slug(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut last_dash = false;
    for c in value.trim().to_lowercase().chars() {
        let mapped = if c == '_' || c.is_whitespace() {
            '-'
        } else if c.is_alphanumeric() || c == '-' {
            c
        } else {
            continue;
        };
        if mapped == '-' {
            if !last_dash {
                out.push('-');
                last_dash = true;
            }
        } else {
            out.push(mapped);
            last_dash = false;
        }
    }
    out.trim_matches('-').to_string()
}

pub(super) fn normalize_tag_slugs(raw: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for r in raw {
        let slug = normalize_tag_slug(r);
        if slug.is_empty() || !seen.insert(slug.clone()) {
            continue;
        }
        out.push(slug);
    }
    out
}

fn reading_regex() -> &'static [(regex::Regex, &'static str)] {
    static CELL: OnceLock<Vec<(regex::Regex, &'static str)>> = OnceLock::new();
    CELL.get_or_init(|| {
        vec![
            (regex::Regex::new(r"(?s)```.*?```").unwrap(), " "),
            (regex::Regex::new(r"`[^`]*`").unwrap(), " "),
            (regex::Regex::new(r"!\[[^\]]*\]\([^)]+\)").unwrap(), " "),
            (regex::Regex::new(r"\[([^\]]+)\]\([^)]+\)").unwrap(), " $1 "),
            (regex::Regex::new(r"<[^>]+>").unwrap(), " "),
            (regex::Regex::new(r"[#>*_~=\-]+").unwrap(), " "),
        ]
    })
    .as_slice()
}

fn count_reading_words(markdown: &str) -> usize {
    let mut text = markdown.replace("\r\n", "\n");
    for (re, replacement) in reading_regex() {
        text = re.replace_all(&text, *replacement).into_owned();
    }
    let mut collapsed = String::with_capacity(text.len());
    let mut last_space = false;
    for c in text.chars() {
        if c.is_whitespace() {
            if !last_space {
                collapsed.push(' ');
                last_space = true;
            }
        } else {
            collapsed.push(c);
            last_space = false;
        }
    }
    let trimmed = collapsed.trim();
    if trimmed.is_empty() {
        return 0;
    }
    trimmed.split(' ').filter(|t| !t.is_empty()).count()
}

pub fn format_reading_label(markdown: &str, words_per_minute: u32) -> String {
    let words = count_reading_words(markdown);
    let wpm = words_per_minute.max(1) as usize;
    let minutes = if words == 0 {
        1
    } else {
        ((words + wpm - 1) / wpm).max(1)
    };
    format!("{minutes} min read")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_tag_slug_lowercases_and_dashes_whitespace() {
        assert_eq!(normalize_tag_slug("Rust Lang"), "rust-lang");
    }

    #[test]
    fn normalize_tag_slug_collapses_multi_dash_and_strips_edges() {
        assert_eq!(normalize_tag_slug("--Rust__Lang  "), "rust-lang");
    }

    #[test]
    fn normalize_tag_slug_drops_non_alphanumerics() {
        assert_eq!(normalize_tag_slug("C# / .NET"), "c-net");
    }

    #[test]
    fn normalize_tag_slug_handles_empty_and_only_punctuation() {
        assert_eq!(normalize_tag_slug(""), "");
        assert_eq!(normalize_tag_slug("---"), "");
    }

    // ── slugify_series_title ─────────────────────────────────────────────────

    #[test]
    fn slugify_series_title_preserves_case() {
        // Unlike `normalize_tag_slug`, series slugs intentionally keep case.
        assert_eq!(slugify_series_title("Hello World"), "Hello-World");
    }

    #[test]
    fn slugify_series_title_collapses_consecutive_specials() {
        assert_eq!(slugify_series_title("Foo  !!  Bar"), "Foo-Bar");
    }

    #[test]
    fn slugify_series_title_strips_edge_dashes() {
        assert_eq!(slugify_series_title("---abc---"), "abc");
    }

    #[test]
    fn slugify_series_title_trims_input_whitespace() {
        assert_eq!(slugify_series_title("  hello  "), "hello");
    }

    #[test]
    fn slugify_series_title_falls_back_when_empty() {
        assert_eq!(slugify_series_title(""), "series");
    }

    #[test]
    fn slugify_series_title_falls_back_when_only_specials() {
        assert_eq!(slugify_series_title("!!!---"), "series");
    }

    #[test]
    fn slugify_series_title_keeps_alphanumeric_unicode() {
        // `char::is_alphanumeric` treats Hangul syllables as alphanumeric, so
        // Korean titles round-trip without losing content.
        assert_eq!(slugify_series_title("한글 시리즈"), "한글-시리즈");
    }

    // ── count_reading_words ──────────────────────────────────────────────────

    #[test]
    fn count_reading_words_returns_zero_for_empty_or_whitespace_only() {
        assert_eq!(count_reading_words(""), 0);
        assert_eq!(count_reading_words("   \n\t  "), 0);
    }

    #[test]
    fn count_reading_words_counts_plain_words() {
        assert_eq!(count_reading_words("hello world"), 2);
        assert_eq!(count_reading_words("one two three four"), 4);
    }

    #[test]
    fn count_reading_words_collapses_repeated_whitespace() {
        assert_eq!(count_reading_words("a    b\t\tc"), 3);
    }

    #[test]
    fn count_reading_words_normalizes_crlf_to_lf() {
        // The very first transform replaces "\r\n" with "\n"; without it the
        // \r would survive into the word counter and split tokens unevenly
        // depending on how the markdown was authored.
        assert_eq!(count_reading_words("hello\r\nworld"), 2);
    }

    #[test]
    fn count_reading_words_strips_fenced_code_blocks() {
        // Code fences are dropped wholesale — a 200-line example shouldn't
        // pad reading time. The trailing word is the only thing left to count.
        let md = "```rust\nfn long_code_example() {\n    // many lines\n}\n```\nhello";
        assert_eq!(count_reading_words(md), 1);
    }

    #[test]
    fn count_reading_words_strips_inline_code() {
        assert_eq!(count_reading_words("use `Vec::new` to allocate"), 3);
    }

    #[test]
    fn count_reading_words_strips_image_syntax_completely() {
        // Image alt text isn't reading content — it's an accessibility label,
        // and dropping it keeps the count comparable across media-heavy posts.
        assert_eq!(
            count_reading_words("see ![alt text here](https://x/img.png) below"),
            2
        );
    }

    #[test]
    fn count_reading_words_keeps_link_label_drops_url() {
        // Plain links contribute their visible label only. URLs would
        // tokenize into spurious "words" otherwise.
        assert_eq!(
            count_reading_words("read [the docs](https://example.com/very/long/path)"),
            3
        );
    }

    #[test]
    fn count_reading_words_strips_html_tags() {
        assert_eq!(count_reading_words("<b>bold</b> word"), 2);
        assert_eq!(count_reading_words("<img src=\"x.jpg\" /> tail"), 1);
    }

    #[test]
    fn count_reading_words_strips_markdown_punctuation() {
        // The `[#>*_~=\-]+` rule turns headings, blockquotes, emphasis, and
        // hr-style runs into whitespace, leaving only the word tokens.
        assert_eq!(count_reading_words("# Heading"), 1);
        assert_eq!(count_reading_words("## Bold **text** here"), 3);
        assert_eq!(count_reading_words("> quoted line"), 2);
    }

    #[test]
    fn count_reading_words_handles_unicode_word_boundaries() {
        // Whitespace-separated CJK clusters count as one token each — matches
        // user-perceived "어절" counting that's already accepted as reading-time
        // approximation in the Korean copy.
        assert_eq!(count_reading_words("안녕 세상 여러분"), 3);
    }

    #[test]
    fn count_reading_words_combined_markdown_features() {
        // End-to-end: heading + link + code + bold all in one paragraph.
        // After the transforms strip code/markup and unwrap the link label,
        // visible tokens are: Title, Click, here, and, is, bold — six words.
        let md = "# Title\n\n[Click here](https://x) and `inline code` is **bold**";
        assert_eq!(count_reading_words(md), 6);
    }

    // ── format_reading_label ─────────────────────────────────────────────────

    #[test]
    fn format_reading_label_floors_at_one_minute_for_empty_input() {
        // Even a zero-word body returns "1 min read" so the UI never shows
        // "0 min read" — the label is always a positive integer.
        assert_eq!(format_reading_label("", 200), "1 min read");
    }

    #[test]
    fn format_reading_label_rounds_up_for_partial_minutes() {
        // 250 words at 200 wpm = 1.25 min → ceil to 2.
        let words: String = (0..250).map(|i| format!("word{i} ")).collect();
        assert_eq!(format_reading_label(&words, 200), "2 min read");
    }

    #[test]
    fn format_reading_label_exact_multiple_does_not_round_up() {
        // 200 words at 200 wpm = exactly 1.0 min, must stay 1.
        let words: String = (0..200).map(|i| format!("word{i} ")).collect();
        assert_eq!(format_reading_label(&words, 200), "1 min read");
    }

    #[test]
    fn format_reading_label_exact_multiple_higher_band() {
        // 400 words at 200 wpm = exactly 2.0 min, must stay 2.
        let words: String = (0..400).map(|i| format!("word{i} ")).collect();
        assert_eq!(format_reading_label(&words, 200), "2 min read");
    }

    #[test]
    fn format_reading_label_treats_zero_wpm_as_one() {
        // wpm=0 would divide by zero; the .max(1) clamp forces 1, so each
        // word becomes a minute. One word ⇒ "1 min read".
        assert_eq!(format_reading_label("hello", 0), "1 min read");
    }

    #[test]
    fn format_reading_label_high_wpm_compresses_short_posts() {
        // 100 words at 1000 wpm = 0.1 min → ceil to 1.
        let words: String = (0..100).map(|i| format!("word{i} ")).collect();
        assert_eq!(format_reading_label(&words, 1000), "1 min read");
    }

    #[test]
    fn format_reading_label_strips_markdown_before_counting() {
        // 6 visible words at 200 wpm = under 1 min → "1 min read". Confirms
        // the function isn't accidentally counting raw markdown bytes (which
        // would give a much larger token count).
        let md = "# Title\n\n[Click here](https://x) and `inline code` is **bold**";
        assert_eq!(format_reading_label(md, 200), "1 min read");
    }
}
