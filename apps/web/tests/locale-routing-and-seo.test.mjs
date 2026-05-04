import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const localesPath = new URL("../src/lib/i18n/locales.ts", import.meta.url);
const localizedUrlsPath = new URL("../src/lib/seo/localized-urls.ts", import.meta.url);
const baseHeadPath = new URL("../src/components/BaseHead.astro", import.meta.url);
const baseLayoutPath = new URL("../src/layouts/BaseLayout.astro", import.meta.url);
const localizedBlogIndexPath = new URL("../src/pages/[locale]/blog/index.astro", import.meta.url);
const localizedBlogSlugPath = new URL("../src/pages/[locale]/blog/[...slug].astro", import.meta.url);

test("web locale helpers define supported public locales", async () => {
  const [localesSource, localizedUrlsSource] = await Promise.all([
    readFile(localesPath, "utf8"),
    readFile(localizedUrlsPath, "utf8"),
  ]);

  assert.match(localesSource, /SUPPORTED_PUBLIC_LOCALES\s*=\s*\["ko",\s*"en",\s*"ja",\s*"zh"\]/);
  assert.match(localesSource, /DEFAULT_PUBLIC_LOCALE\s*=\s*"ko"/);
  assert.match(localizedUrlsSource, /buildLocalizedAlternates/);
  assert.match(localizedUrlsSource, /x-default/);
});

test("public layout and head are locale-aware", async () => {
  const [baseHeadSource, baseLayoutSource] = await Promise.all([
    readFile(baseHeadPath, "utf8"),
    readFile(baseLayoutPath, "utf8"),
  ]);

  assert.match(baseLayoutSource, /locale\?: string;/);
  assert.match(baseLayoutSource, /const \{ title, description, image, bodyClass = '', locale = 'ko', alternates = \[] \} = Astro\.props;/);
  assert.match(baseLayoutSource, /<html lang=\{locale\} class=\{htmlClassName\}>/);

  assert.match(baseHeadSource, /locale\?: string;/);
  assert.match(baseHeadSource, /alternates\?:/);
  assert.match(baseHeadSource, /for \(const alternate of alternates\)/);
  assert.match(baseHeadSource, /rel="alternate"/);
  assert.match(baseHeadSource, /hreflang=\{alternate\.hrefLang\}/);
});

test("localized blog routes exist and read locale params", async () => {
  const [indexSource, slugSource] = await Promise.all([
    readFile(localizedBlogIndexPath, "utf8"),
    readFile(localizedBlogSlugPath, "utf8"),
  ]);

  assert.match(indexSource, /Astro\.params\.locale/);
  assert.match(indexSource, /locale=\{locale\}/);
  assert.match(indexSource, /alternates=\{/);
  assert.match(slugSource, /Astro\.params\.locale/);
  assert.match(slugSource, /locale=\{locale\}/);
  assert.match(slugSource, /alternates=\{/);
});
