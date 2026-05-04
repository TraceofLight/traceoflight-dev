import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogIndexPath = new URL("../src/pages/[locale]/blog/index.astro", import.meta.url);
const blogArchiveFiltersPath = new URL(
  "../src/components/public/BlogArchiveFilters.tsx",
  import.meta.url,
);
const postCardPath = new URL(
  "../src/components/PostCard.astro",
  import.meta.url,
);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);

test("blog archive page forwards selected tags from the query to the filter island", async () => {
  const source = await readFile(blogIndexPath, "utf8");

  assert.match(source, /selectedTagsFromQuery/);
  assert.match(source, /initialSelectedTags=\{selectedTagsFromQuery\}/);
  assert.match(source, /tagFilters=\{tagFilters\}/);
});

test("blog archive filter island applies tag filtering and query sync", async () => {
  const source = await readFile(blogArchiveFiltersPath, "utf8");

  assert.match(source, /searchParams\.delete\(["']tag["']\)/);
  assert.match(source, /url\.searchParams\.set\(["']tag["']/);
  assert.match(source, /window\.history\.replaceState/);
  assert.match(source, /buildSummaryRequestUrl/);
  assert.match(source, /fetch\(/);
  assert.match(source, /\/internal-api\/posts\/summary/);
});

test("post card exports normalized tag data and chips for the new card layout", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(source, /data-tags=/);
  assert.match(
    source,
    /rounded-full border border-white\/80 bg-slate-100\/88 px-2\.5 py-0\.5 text-\[0\.72rem\]/,
  );
  assert.match(source, /(empty-article-image\.png|DEFAULT_ARTICLE_IMAGE)/);
  assert.match(source, /postTags =/);
});

test("db post models carry tags from backend payload", async () => {
  const source = await readFile(blogDbPath, "utf8");

  assert.match(source, /interface DbTag/);
  assert.match(source, /tags:\s*DbTag\[]/);
  assert.match(source, /post\.tags/);
});
