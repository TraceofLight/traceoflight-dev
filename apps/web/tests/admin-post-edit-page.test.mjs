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

  assert.doesNotMatch(source, /METADATA/);
  assert.match(source, /requestBackend\(`\/posts\/\$\{encodeURIComponent\(slug\)\}`\)/);
  assert.match(source, /normalizeAdminPostPayload\(await response\.json\(\)\)/);
  assert.match(source, /data-writer-mode=["']edit["']/);
  assert.match(source, /data-edit-slug=\{slug\}/);
  assert.match(source, /value=\{initialTitle\}/);
  assert.match(source, /hidden=\{initialContentKind !== "project"\}/);
  assert.match(source, /id="writer-initial-payload"/);
  assert.match(source, /type="application\/json"/);
  assert.match(source, /JSON\.stringify\(initialPayload\)/);
  assert.doesNotMatch(source, /initNewPostAdminPage\(\{/);
});

test("admin new writer page keeps create mode bootstrap", async () => {
  const source = await readFile(newPagePath, "utf8");

  assert.doesNotMatch(source, /METADATA/);
  assert.match(source, /data-writer-mode=["']create["']/);
  assert.match(source, /Astro\.url\.searchParams\.get\(["']content_kind["']\)/);
  assert.match(source, /data-initial-content-kind=\{initialContentKind\}/);
  assert.match(source, /id="writer-meta-panel"[\s\S]*data-content-kind=\{initialContentKind\}/);
  assert.match(source, /id="writer-project-fields"[\s\S]*hidden=\{initialContentKind !== "project"\}/);
  assert.match(source, /id="writer-initial-payload"/);
  assert.match(source, />null<\/script>/);
  assert.doesNotMatch(source, /initNewPostAdminPage\(\{/);
});
