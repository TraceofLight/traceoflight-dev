import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogPostLayoutPath = new URL("../src/layouts/BlogPost.astro", import.meta.url);
const dbAdapterPath = new URL("../src/lib/blog-db.ts", import.meta.url);
const blogSlugPagePath = new URL("../src/pages/blog/[...slug].astro", import.meta.url);

test("blog db adapter exposes series context projection", async () => {
  const source = await readFile(dbAdapterPath, "utf8");

  assert.match(source, /series_context\?:/);
  assert.match(source, /seriesContext:/);
  assert.match(source, /prevPostSlug/);
  assert.match(source, /nextPostSlug/);
});

test("blog slug page passes series context into BlogPost layout", async () => {
  const source = await readFile(blogSlugPagePath, "utf8");

  assert.match(source, /seriesContext=\{dbPost\.seriesContext\}/);
});

test("blog detail layout renders in-series navigation block", async () => {
  const source = await readFile(blogPostLayoutPath, "utf8");

  assert.match(source, /interface SeriesContext/);
  assert.match(source, /seriesContext\?: SeriesContext/);
  assert.match(source, /aria-label="시리즈 탐색"/);
  assert.match(source, /seriesPosts\.map/);
  assert.match(source, /relationLabel/);
  assert.doesNotMatch(source, /post-series-prev/);
  assert.doesNotMatch(source, /post-series-next/);
});
