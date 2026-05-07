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
}
