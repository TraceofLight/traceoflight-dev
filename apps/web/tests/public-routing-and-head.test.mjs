import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const baseHeadPath = new URL("../src/components/BaseHead.astro", import.meta.url);
const astroConfigPath = new URL("../astro.config.mjs", import.meta.url);
const baseLayoutPath = new URL("../src/layouts/BaseLayout.astro", import.meta.url);
const adminWriterLayoutPath = new URL("../src/layouts/AdminWriterLayout.astro", import.meta.url);
const middlewarePath = new URL("../src/middleware.ts", import.meta.url);
const notFoundPagePath = new URL("../src/pages/404.astro", import.meta.url);
const logoutPagePath = new URL("../src/pages/logout.ts", import.meta.url);
const robotsTxtPath = new URL("../public/robots.txt", import.meta.url);

test("base head uses canonical site urls and custom favicon assets", async () => {
  const source = await readFile(baseHeadPath, "utf8");

  assert.match(source, /const canonicalBase = resolvePublicSiteOrigin\(Astro\.site \?\? SITE_URL\);/);
  assert.match(source, /const canonicalURL = new URL\(Astro\.url\.pathname, canonicalBase\);/);
  assert.match(
    source,
    /const ogImage = image\s*\?\s*new URL\(image\.src, canonicalBase\)\s*:\s*new URL\('\/android-chrome-512x512\.png', canonicalBase\);/,
  );
  assert.match(source, /<link rel="sitemap" href="\/sitemap\.xml" \/>/);
  assert.match(source, /<meta property="og:url" content=\{canonicalURL\} \/>/);
  assert.match(source, /<meta property="og:site_name" content=\{SITE_TITLE\} \/>/);
  assert.match(source, /<meta name="author" content=\{resolvedAuthor\} \/>/);
  assert.match(source, /<meta property="article:published_time" content=\{publishedTimeIso\} \/>/);
  assert.match(source, /<script is:inline type="application\/ld\+json" set:html=\{structuredDataJson\} \/>/);
  assert.match(source, /<meta property="twitter:url" content=\{canonicalURL\} \/>/);
  assert.match(source, /const iconVersion = '20260313';/);
  assert.match(source, /<link rel="shortcut icon" href=\{`\/favicon\.ico\?v=\$\{iconVersion\}`\} \/>/);
  assert.match(source, /<link rel="icon" type="image\/png" sizes="32x32" href=\{`\/favicon-32x32\.png\?v=\$\{iconVersion\}`\} \/>/);
  assert.doesNotMatch(source, /meta name="generator"/);
  assert.doesNotMatch(source, /sitemap-index\.xml/);
});

test("public site has dedicated 404 page and logout redirect route", async () => {
  const [notFoundSource, logoutSource] = await Promise.all([
    readFile(notFoundPagePath, "utf8"),
    readFile(logoutPagePath, "utf8"),
  ]);

  assert.match(notFoundSource, /찾을 수 없는 페이지/);
  assert.match(notFoundSource, /\/blog/);
  assert.match(logoutSource, /createAdminLogoutRedirect/);
  assert.match(logoutSource, /createAdminLogoutResponse/);
});

test("public site exposes a minimal allow-all robots.txt with sitemap", async () => {
  const robotsSource = await readFile(robotsTxtPath, "utf8");

  assert.match(robotsSource, /^User-agent: \*\s*$/m);
  assert.match(robotsSource, /^Allow: \/\s*$/m);
  assert.match(
    robotsSource,
    /^Sitemap: https:\/\/www\.traceoflight\.dev\/sitemap\.xml\s*$/m,
  );
  assert.doesNotMatch(robotsSource, /^Disallow: \/admin\s*$/m);
});

test("layout shell uses Korean document language for public and admin pages", async () => {
  const [baseLayoutSource, adminWriterLayoutSource] = await Promise.all([
    readFile(baseLayoutPath, "utf8"),
    readFile(adminWriterLayoutPath, "utf8"),
  ]);

  assert.match(baseLayoutSource, /<html lang="ko" class=\{htmlClassName\}>/);
  assert.match(adminWriterLayoutSource, /<html lang="ko">/);
});

test("sitemap config falls back to the www site url", async () => {
  const configSource = await readFile(astroConfigPath, "utf8");

  assert.match(configSource, /site:\s*process\.env\.SITE_URL\s*\?\?\s*'https:\/\/www\.traceoflight\.dev'/);
  assert.doesNotMatch(configSource, /sitemap\(\{/);
});

test("middleware contains public url canonicalization for host and slash variants", async () => {
  const middlewareSource = await readFile(middlewarePath, "utf8");

  assert.match(middlewareSource, /buildPublicCanonicalUrl/);
  assert.match(middlewareSource, /return context\.redirect\(redirectUrl\.toString\(\), 301\);/);
  assert.match(middlewareSource, /import \{ buildPublicCanonicalUrl \} from "\.\/lib\/public-url";/);
});
