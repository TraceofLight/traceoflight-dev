import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogPostLayoutPath = new URL(
  "../src/layouts/BlogPost.astro",
  import.meta.url,
);

test("blog post layout keeps top and bottom archive navigation in the new shell", async () => {
  const source = await readFile(blogPostLayoutPath, "utf8");

  assert.match(source, /aria-label="Post navigation"/);
  assert.match(source, /href="\/blog\/"/);
  assert.match(source, /블로그로 돌아가기/);
  assert.match(source, /모든 글 보기/);
  assert.match(source, /inline-flex items-center gap-2 rounded-full border/);
  assert.doesNotMatch(source, /button button-ghost/);
});

test("blog post layout no longer depends on legacy navigation hook classes", async () => {
  const source = await readFile(blogPostLayoutPath, "utf8");

  assert.doesNotMatch(source, /post-top-nav/);
  assert.doesNotMatch(source, /post-bottom-nav/);
  assert.doesNotMatch(source, /post-back-link/);
  assert.doesNotMatch(source, /post-archive-link/);
  assert.match(source, /모든 글 보기/);
});
