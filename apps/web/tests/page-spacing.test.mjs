import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const layoutCssPath = new URL("../src/styles/layout.css", import.meta.url);
const adminImportsPagePath = new URL("../src/pages/admin/imports.astro", import.meta.url);

test("shared page shell uses tighter top spacing while keeping footer room", async () => {
  const source = await readFile(layoutCssPath, "utf8");

  assert.match(source, /\.page\s*\{\s*flex:\s*1 0 auto;\s*padding:\s*2\.5rem 0 6rem;/);
  assert.match(source, /@media \(max-width: 840px\)\s*\{[\s\S]*\.page\s*\{\s*padding-top:\s*1\.75rem;/);
  assert.match(source, /html\.page-home \.page\s*\{\s*padding-top:\s*0\.75rem;/);
});

test("admin imports page relies on shared shell spacing instead of extra vertical padding", async () => {
  const source = await readFile(adminImportsPagePath, "utf8");

  assert.match(source, /<section class="mx-auto flex max-w-6xl flex-col">/);
  assert.doesNotMatch(source, /py-10/);
  assert.doesNotMatch(source, /py-12/);
});
