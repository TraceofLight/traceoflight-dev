import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const blogSlugPagePath = new URL("../src/pages/[locale]/blog/[...slug].astro", import.meta.url);
const blogPostLayoutPath = new URL("../src/layouts/BlogPost.astro", import.meta.url);
const postAdminActionsPath = new URL(
  "../src/components/public/PostAdminActions.tsx",
  import.meta.url,
);

test("blog slug page passes admin flags and slug to post layout", async () => {
  const source = await readFile(blogSlugPagePath, "utf8");

  assert.match(source, /isAdminViewer/);
  assert.match(source, /adminPostSlug=\{dbPost\.slug\}/);
  assert.match(source, /showAdminActions=\{isAdminViewer\}/);
});

test("blog post layout mounts a React admin actions island instead of an inline delete script", async () => {
  const [layoutSource, actionSource] = await Promise.all([
    readFile(blogPostLayoutPath, "utf8"),
    readFile(postAdminActionsPath, "utf8"),
  ]);

  assert.match(layoutSource, /adminPostSlug/);
  assert.match(layoutSource, /showAdminActions/);
  assert.match(
    layoutSource,
    /import PostAdminActions from ["']\.\.\/components\/public\/PostAdminActions["']/,
  );
  assert.match(layoutSource, /<PostAdminActions[\s\S]*client:load[\s\S]*adminPostSlug=\{adminPostSlug\}/);
  assert.doesNotMatch(layoutSource, /initializePostAdminDeleteModal/);
  assert.doesNotMatch(layoutSource, /id=["']post-admin-delete-modal["']/);

  assert.match(actionSource, /AlertDialog/);
  assert.match(actionSource, /id="post-admin-actions"/);
  assert.match(actionSource, /const postPath = `\/internal-api\/posts\/\$\{encodeURIComponent\(adminPostSlug\)\}`/);
  assert.match(actionSource, /method:\s*["']DELETE["']/);
  assert.match(actionSource, /response\.status\s*===\s*403/);
  assert.match(actionSource, /method:\s*["']POST["']/);
  assert.match(actionSource, /action:\s*["']delete["']/);
  assert.match(actionSource, /response\.status\s*===\s*404/);
  assert.match(actionSource, /window\.location\.assign\(["']\/blog\/["']\)/);
});
