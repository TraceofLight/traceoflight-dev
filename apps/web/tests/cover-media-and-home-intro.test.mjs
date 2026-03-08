import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const contentConfigPath = new URL("../src/content.config.ts", import.meta.url);
const contentSourcePath = new URL("../src/lib/content-source.ts", import.meta.url);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);
const blogPostLayoutPath = new URL("../src/layouts/BlogPost.astro", import.meta.url);
const blogIndexPath = new URL("../src/pages/blog/index.astro", import.meta.url);
const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);
const homePagePath = new URL("../src/pages/index.astro", import.meta.url);
const seriesIndexPath = new URL("../src/pages/series/index.astro", import.meta.url);
const seriesDetailPath = new URL("../src/pages/series/[slug].astro", import.meta.url);
const seriesAdminPanelPath = new URL(
  "../src/components/public/SeriesAdminPanel.tsx",
  import.meta.url,
);

test("cover naming replaces the old highlight terminology across public content rendering", async () => {
  const sources = await Promise.all([
    readFile(contentConfigPath, "utf8"),
    readFile(contentSourcePath, "utf8"),
    readFile(blogDbPath, "utf8"),
    readFile(blogPostLayoutPath, "utf8"),
    readFile(blogIndexPath, "utf8"),
    readFile(homePagePath, "utf8"),
    readFile(seriesDetailPath, "utf8"),
    readFile(seriesAdminPanelPath, "utf8"),
  ]);

  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /H\u0065roMediaImage|h\u0065ro-media|h\u0065roRoleTokens|series-h\u0065ro/i,
    );
  }
});

test("placeholder images also route through browser-sized cover image URLs", async () => {
  const [postCardSource, blogIndexSource, seriesIndexSource, seriesDetailSource] =
    await Promise.all([
      readFile(postCardPath, "utf8"),
      readFile(blogIndexPath, "utf8"),
      readFile(seriesIndexPath, "utf8"),
      readFile(seriesDetailPath, "utf8"),
    ]);

  assert.match(postCardSource, /toBrowserImageUrl\(fallbackCoverImage,\s*\{/);
  assert.match(blogIndexSource, /toBrowserImageUrl\(["']\/images\/empty-article-image\.png["']/);
  assert.match(seriesIndexSource, /toBrowserImageUrl\(defaultSeriesCoverImage,\s*\{/);
  assert.match(seriesDetailSource, /toBrowserImageUrl\(defaultSeriesCoverImage,\s*\{/);
  assert.match(seriesDetailSource, /toBrowserImageUrl\(defaultSeriesPostCoverImage,\s*\{/);
});

test("home intro section uses separate copy and profile panels with centered profile space", async () => {
  const source = await readFile(homePagePath, "utf8");

  assert.match(source, /id="home-intro-copy-panel"/);
  assert.match(source, /id="home-intro-profile-panel"/);
  assert.match(source, /id="home-intro-profile-frame"/);
  assert.match(source, /lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(320px,0\.65fr\)\]/);
  assert.match(source, /class="grid h-full content-center gap-6/);
  assert.match(source, /class="flex h-full items-center justify-center lg:justify-center"/);
  assert.match(source, /class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2\.5 text-sm font-medium text-primary-foreground shadow-\[0_10px_30px_rgba\(49,130,246,0\.22\)\]/);
  assert.doesNotMatch(source, /h\u0065roRoleTokens/);
});
