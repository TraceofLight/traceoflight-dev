/**
 * Centralized accessors for environment-driven URLs used across the
 * frontend. Values are computed lazily and memoized after first read so
 * repeated lookups inside Astro components do not redo string parsing.
 */

let cachedSiteUrl: string | undefined;
let cachedMediaBaseUrl: string | undefined;

function readEnvSiteUrl(): string {
  // `import.meta.env` is the canonical Vite-side env. `process.env` is used
  // when running in Node (e.g. middleware on the SSR host).
  const fromImportMeta =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env.SITE_URL as string | undefined)
      : undefined;
  const fromProcess =
    typeof process !== "undefined" && process.env
      ? process.env.SITE_URL
      : undefined;
  return (fromImportMeta ?? fromProcess ?? "").trim();
}

/**
 * Returns the configured `SITE_URL` (trimmed). Empty string when unset.
 */
export function getSiteUrl(): string {
  if (cachedSiteUrl === undefined) {
    cachedSiteUrl = readEnvSiteUrl();
  }
  return cachedSiteUrl;
}

/**
 * Returns the media base URL derived from `SITE_URL`. Falls back to the
 * relative `/media` path when no site URL is configured.
 */
export function getMediaBaseUrl(): string {
  if (cachedMediaBaseUrl === undefined) {
    const siteUrl = getSiteUrl();
    cachedMediaBaseUrl = siteUrl
      ? `${siteUrl.replace(/\/+$/, "")}/media`
      : "/media";
  }
  return cachedMediaBaseUrl;
}

/**
 * Resets memoized values. Intended for tests.
 */
export function resetEnvCacheForTests(): void {
  cachedSiteUrl = undefined;
  cachedMediaBaseUrl = undefined;
}
