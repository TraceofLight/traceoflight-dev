import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogIndexPath = new URL("../src/pages/blog/index.astro", import.meta.url);
const blogArchiveFiltersPath = new URL(
  "../src/components/public/BlogArchiveFilters.tsx",
  import.meta.url,
);
const postCardPath = new URL(
  "../src/components/PostCard.astro",
  import.meta.url,
);

test("blog archive page mounts a React filter island and passes server data", async () => {
  const [pageSource, islandSource] = await Promise.all([
    readFile(blogIndexPath, "utf8"),
    readFile(blogArchiveFiltersPath, "utf8"),
  ]);

  assert.match(
    pageSource,
    /import BlogArchiveFilters from ["']\.\.\/\.\.\/components\/public\/BlogArchiveFilters["']/,
  );
  assert.match(pageSource, /<BlogArchiveFilters[\s\S]*client:load/);
  assert.match(pageSource, /posts=\{archivePosts\}/);
  assert.match(pageSource, /tagFilters=\{tagFilters\}/);
  assert.match(pageSource, /initialSelectedTags=\{selectedTagsFromQuery\}/);
  assert.doesNotMatch(pageSource, /initializeBlogArchivePage/);
  assert.doesNotMatch(
    pageSource,
    /document\.addEventListener\(["']astro:page-load["']/,
  );

  assert.match(islandSource, /type BlogArchivePost/);
  assert.match(islandSource, /window\.history\.replaceState/);
});

test("blog archive filter island provides search, sort, and admin visibility controls", async () => {
  const source = await readFile(blogArchiveFiltersPath, "utf8");

  assert.match(source, /placeholder="포스트 검색/);
  assert.match(source, /aria-label="정렬 방식"/);
  assert.match(source, /글 작성/);
  assert.match(source, /비공개/);
  assert.match(source, /총 \{filteredPosts\.length\}개의 포스트/);
});

test("blog archive page does not cap db-backed posts at a fixed 50-item fetch", async () => {
  const source = await readFile(blogIndexPath, "utf8");

  assert.match(source, /listAllPublishedDbPosts\(/);
  assert.doesNotMatch(source, /listPublishedDbPosts\(50,\s*\{/);
});

test("post card uses a tailwind-based public card structure", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(source, /rounded-3xl border border-border\/60 bg-card/);
  assert.match(source, /line-clamp-2 text-sm text-muted-foreground/);
  assert.match(source, /data-visibility=/);
  assert.match(source, /data-tags=/);
  assert.doesNotMatch(source, /post-card-default-anchor/);
  assert.doesNotMatch(source, /post-card-archive-anchor/);
});
