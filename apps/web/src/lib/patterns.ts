/**
 * Shared regular expressions reused across multiple modules. Keeping the
 * patterns colocated avoids subtle divergence (case sensitivity, anchor
 * handling) between independent regex literals.
 */

/** Matches `.md` or `.mdx` filename suffixes (case-insensitive). */
export const MD_EXT_RE = /\.(md|mdx)$/i;

/**
 * Matches an absolute http(s) URL prefix (case-insensitive). Use `.test`
 * to detect external references that should not be rewritten through the
 * relative resolution helpers.
 */
export const ABSOLUTE_URL_RE = /^https?:\/\//i;
