import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pagePath = new URL("../src/pages/admin/projects.astro", import.meta.url);

test("admin projects page provides a dedicated project management entry", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /BaseLayout/);
  assert.match(source, /프로젝트 관리/);
  assert.match(source, /프로젝트 순서 조정/);
  assert.match(source, /\/projects/);
  assert.match(source, /\/admin\/posts\/new\?content_kind=project/);
  assert.match(source, /PUBLIC_SECTION_SURFACE_CLASS|PUBLIC_SECTION_SURFACE_STRONG_CLASS/);
});
