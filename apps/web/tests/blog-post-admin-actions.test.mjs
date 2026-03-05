import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogSlugPagePath = new URL("../src/pages/blog/[...slug].astro", import.meta.url);
const blogPostLayoutPath = new URL("../src/layouts/BlogPost.astro", import.meta.url);
const blogStylePath = new URL("../src/styles/components/blog.css", import.meta.url);

test("blog slug page passes admin flags and slug to post layout", async () => {
  const source = await readFile(blogSlugPagePath, "utf8");

  assert.match(source, /isAdminViewer/);
  assert.match(source, /adminPostSlug=\{dbPost\.slug\}/);
  assert.match(source, /showAdminActions=\{isAdminViewer\}/);
});

test("blog post layout includes admin edit delete controls and delete confirm modal", async () => {
  const [layoutSource, styleSource] = await Promise.all([
    readFile(blogPostLayoutPath, "utf8"),
    readFile(blogStylePath, "utf8"),
  ]);

  assert.match(layoutSource, /adminPostSlug/);
  assert.match(layoutSource, /showAdminActions/);
  assert.match(layoutSource, /id=["']post-admin-actions["']/);
  assert.match(layoutSource, /id=["']post-admin-delete-trigger["']/);
  assert.match(layoutSource, /id=["']post-admin-delete-modal["']/);
  assert.match(layoutSource, /data-post-slug=\{adminPostSlug\}/);
  assert.match(layoutSource, /id=["']post-admin-delete-confirm["']/);
  assert.match(layoutSource, /id=["']post-admin-delete-cancel["']/);
  assert.match(layoutSource, /encodedAdminPostSlug/);
  assert.match(layoutSource, /\/admin\/posts\/\$\{encodedAdminPostSlug\}\/edit/);
  assert.match(layoutSource, /modal\.dataset\.deleteModalBound/);
  assert.match(layoutSource, /const slug = typeof modal\.dataset\.postSlug === 'string' \? modal\.dataset\.postSlug\.trim\(\) : ''/);
  assert.match(layoutSource, /const postPath = `\/internal-api\/posts\/\$\{encodeURIComponent\(slug\)\}`/);
  assert.match(layoutSource, /const initializePostAdminDeleteModal = \(\) =>/);
  assert.match(layoutSource, /document\.addEventListener\('astro:page-load', initializePostAdminDeleteModal\)/);
  assert.match(layoutSource, /fetch\(postPath,\s*\{/);
  assert.match(layoutSource, /method:\s*["']DELETE["']/);
  assert.match(layoutSource, /response\.status\s*===\s*403/);
  assert.match(layoutSource, /method:\s*["']POST["']/);
  assert.match(layoutSource, /action:\s*["']delete["']/);
  assert.match(layoutSource, /response\.status\s*===\s*404/);
  assert.match(layoutSource, /window\.location\.assign\(["']\/blog\/["']\)/);

  assert.match(styleSource, /\.post-admin-actions/);
  assert.match(styleSource, /\.post-admin-modal/);
});
