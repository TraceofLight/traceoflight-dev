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
  assert.match(source, /locale\?: string;/);
  assert.match(source, /const localizedBlogIndexPath = `\/\$\{locale\}\/blog\/`;/);
  assert.match(source, /href=\{localizedBlogIndexPath\}/);
  assert.match(source, /블로그로 돌아가기/);
  assert.match(source, /모든 글 보기/);
  assert.match(source, /PUBLIC_SURFACE_ACTION_CLASS/);
  assert.match(source, /class=\{PUBLIC_SURFACE_ACTION_CLASS\}/);
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

test("blog post layout gives markdown code blocks a dedicated shell instead of the plain global pre box", async () => {
  const source = await readFile(blogPostLayoutPath, "utf8");

  assert.match(source, /class="markdown-prose/);
  assert.doesNotMatch(source, /\[\&_pre\]:overflow-x-auto/);
  assert.doesNotMatch(source, /\[\&_pre\]:bg-\[\#07142b\]/);
  assert.doesNotMatch(source, /\[\&_pre_code\]:bg-transparent/);
});

test("blog post layout mounts the comments surface below the archive action", async () => {
  const source = await readFile(blogPostLayoutPath, "utf8");

  assert.match(source, /PostComments/);
  assert.match(source, /client:load/);
  assert.match(source, /commentsData/);
  assert.match(source, /isAdminViewer/);
  assert.match(source, /모든 글 보기[\s\S]*<section class="mt-10"/);
});
