import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const baseHeadPath = new URL("../src/components/BaseHead.astro", import.meta.url);
const astroConfigPath = new URL("../astro.config.mjs", import.meta.url);
const notFoundPagePath = new URL("../src/pages/404.astro", import.meta.url);
const logoutPagePath = new URL("../src/pages/logout.ts", import.meta.url);
const robotsTxtPath = new URL("../public/robots.txt", import.meta.url);

test("base head uses canonical site urls and custom favicon assets", async () => {
  const source = await readFile(baseHeadPath, "utf8");

  assert.match(source, /const canonicalBase = Astro\.site \?\? new URL\(SITE_URL\);/);
  assert.match(source, /const canonicalURL = new URL\(Astro\.url\.pathname, canonicalBase\);/);
  assert.match(
    source,
    /const ogImage = image\s*\?\s*new URL\(image\.src, canonicalBase\)\s*:\s*new URL\('\/android-chrome-512x512\.png', canonicalBase\);/,
  );
  assert.match(source, /<meta property="og:url" content=\{canonicalURL\} \/>/);
  assert.match(source, /<meta property="twitter:url" content=\{canonicalURL\} \/>/);
  assert.match(source, /<link rel="shortcut icon" href=\{`\/favicon\.ico\?v=\$\{iconVersion\}`\} \/>/);
  assert.match(source, /<link rel="icon" type="image\/png" sizes="32x32" href=\{`\/favicon-32x32\.png\?v=\$\{iconVersion\}`\} \/>/);
  assert.doesNotMatch(source, /meta name="generator"/);
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
    /^Sitemap: https:\/\/www\.traceoflight\.dev\/sitemap-index\.xml\s*$/m,
  );
  assert.doesNotMatch(robotsSource, /^Disallow: \/admin\s*$/m);
});

test("sitemap uses the www site url and excludes admin routes", async () => {
  const configSource = await readFile(astroConfigPath, "utf8");

  assert.match(configSource, /site:\s*process\.env\.SITE_URL\s*\?\?\s*'https:\/\/www\.traceoflight\.dev'/);
  assert.match(configSource, /sitemap\(\{/);
  assert.match(configSource, /filter:\s*\(page\)\s*=>\s*!page\.includes\('\/admin\/'\)/);
});
