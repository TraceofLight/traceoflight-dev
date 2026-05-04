import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("locale-prefixed home page exists with strict locale guard", async () => {
  const src = await readFile("src/pages/[locale]/index.astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /Astro\.params\.locale/);
  assert.match(src, /pickDictionary/);
});

test("locale-prefixed projects index exists with strict locale guard", async () => {
  const src = await readFile("src/pages/[locale]/projects/index.astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /listPublishedDbProjects/);
  assert.match(src, /pickDictionary/);
});

test("locale-prefixed project detail page exists with strict locale guard", async () => {
  const src = await readFile("src/pages/[locale]/projects/[slug].astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /Astro\.params\.slug/);
});

test("locale-prefixed series index exists", async () => {
  const src = await readFile("src/pages/[locale]/series/index.astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /pickDictionary/);
});

test("locale-prefixed series detail exists", async () => {
  const src = await readFile("src/pages/[locale]/series/[slug].astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /Astro\.params\.slug/);
});

const REDIRECT_FIXTURES = [
  ["src/pages/index.astro", "/${locale}/"],
  ["src/pages/projects/index.astro", "/${locale}/projects/"],
  ["src/pages/projects/[slug].astro", "/${locale}/projects/${slug}/"],
  ["src/pages/series/index.astro", "/${locale}/series/"],
  ["src/pages/series/[slug].astro", "/${locale}/series/${slug}/"],
];

for (const [path, target] of REDIRECT_FIXTURES) {
  test(`${path} dynamically redirects based on locale preference`, async () => {
    const src = await readFile(path, "utf8");
    assert.match(src, /Astro\.redirect\(/);
    // 302 (temporary) — destination depends on cookie / Accept-Language, so 301
    // (permanent) would be wrong for this content negotiation.
    assert.match(src, /302/);
    assert.match(src, /resolvePreferredLocale/);
    assert.ok(src.includes(target), `expected source to redirect to ${target}`);
  });
}
