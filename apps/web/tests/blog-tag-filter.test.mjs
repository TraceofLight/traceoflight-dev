import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogIndexPath = new URL("../src/pages/blog/index.astro", import.meta.url);
const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);
const stylesPath = new URL(
  "../src/styles/components/blog.css",
  import.meta.url,
);

test("blog archive page renders tag filter controls", async () => {
  const source = await readFile(blogIndexPath, "utf8");

  assert.match(source, /id="blog-filter-panel"/);
  assert.match(source, /data-visibility-filter=/);
  assert.match(source, /data-tag-filter=/);
  assert.doesNotMatch(source, /전체 태그/);
  assert.doesNotMatch(source, /id="blog-tag-count"/);
});

test("blog archive script applies tag filtering and query sync", async () => {
  const source = await readFile(blogIndexPath, "utf8");

  assert.match(source, /activeTags/);
  assert.match(source, /matchesTag/);
  assert.match(source, /url\.searchParams\.set\('tag'/);
  assert.match(source, /new URLSearchParams\(window\.location\.search\)/);
});

test("post card exports tag data attributes and chips", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(source, /data-tags=/);
  assert.match(source, /post-card-tag-list/);
  assert.match(source, /empty-article-image\.png/);
  assert.match(source, /is-empty/);
  assert.match(source, /post-card-default-description/);
  assert.match(source, /post.tags/);
});

test("db post models carry tags from backend payload", async () => {
  const source = await readFile(blogDbPath, "utf8");

  assert.match(source, /interface DbTag/);
  assert.match(source, /tags:\s*DbTag\[]/);
  assert.match(source, /post\.tags/);
});

test("blog styles include tag filter and card chip rules", async () => {
  const source = await readFile(stylesPath, "utf8");

  assert.match(source, /\.blog-archive-filter-panel/);
  assert.match(source, /\.post-card-tag-list/);
  assert.match(source, /\.post-card-tag-chip/);
});
