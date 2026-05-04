import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogPostLayoutPath = new URL("../src/layouts/BlogPost.astro", import.meta.url);
const dbAdapterPath = new URL("../src/lib/blog-db.ts", import.meta.url);
const blogSlugPagePath = new URL("../src/pages/[locale]/blog/[...slug].astro", import.meta.url);

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
  // Aria label is now sourced from the dictionary so the sidebar speaks the
  // current locale.
  assert.match(source, /aria-label=\{t\.blogPost\.seriesNavLabel\}/);
  assert.match(source, /seriesPosts\.map/);
  assert.match(source, /relationLabel/);
  // The order indicator now goes through the dictionary so each locale can
  // express "post N of M" naturally — Korean keeps its "N개 글 중 X번째"
  // phrasing, English uses "Post X of N", etc.
  assert.match(source, /t\.blogPost\.seriesProgress[\s\S]*?\.replace\(\s*"\{order\}"/);
  assert.match(source, /\.replace\(\s*"\{total\}"/);
  assert.match(
    source,
    /xl:grid-cols-\[minmax\(0,3\.7fr\)_minmax\(320px,0\.9fr\)\]/,
  );
  assert.match(source, /max-w-\[1320px\]/);
  assert.match(source, /grid-cols-\[124px_minmax\(0,1fr\)\]/);
  assert.match(source, /items-center/);
  assert.match(source, /content-center/);
  assert.doesNotMatch(source, /post-series-prev/);
  assert.doesNotMatch(source, /post-series-next/);
});
