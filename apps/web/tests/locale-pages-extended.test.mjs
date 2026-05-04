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
  ["src/pages/index.astro", "/ko/"],
  ["src/pages/projects/index.astro", "/ko/projects/"],
  ["src/pages/projects/[slug].astro", "/ko/projects/${slug}/"],
  ["src/pages/series/index.astro", "/ko/series/"],
  ["src/pages/series/[slug].astro", "/ko/series/${slug}/"],
];

for (const [path, target] of REDIRECT_FIXTURES) {
  test(`${path} 301-redirects to ${target}`, async () => {
    const src = await readFile(path, "utf8");
    assert.match(src, /Astro\.redirect\(/);
    assert.match(src, /301/);
  });
}
