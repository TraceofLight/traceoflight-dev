import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const editPagePath = new URL(
  "../src/pages/admin/posts/[slug]/edit.astro",
  import.meta.url,
);
const newPagePath = new URL("../src/pages/admin/posts/new.astro", import.meta.url);

test("admin post edit page bootstraps writer in edit mode", async () => {
  const source = await readFile(editPagePath, "utf8");

  assert.match(source, /data-writer-mode=["']edit["']/);
  assert.match(source, /data-edit-slug=\{slug\}/);
  assert.match(source, /initNewPostAdminPage\(\{\s*mode:\s*["']edit["']/);
  assert.doesNotMatch(source, /mode:\s*["']edit["'][\s\S]*slug/);
});

test("admin new writer page keeps create mode bootstrap", async () => {
  const source = await readFile(newPagePath, "utf8");

  assert.match(source, /data-writer-mode=["']create["']/);
  assert.match(source, /initNewPostAdminPage\(\{\s*mode:\s*["']create["']/);
});
