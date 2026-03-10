import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const resumeRoutePath = new URL("../src/pages/resume.ts", import.meta.url);

test("public resume route proxies the registered PDF and renders an empty state when missing", async () => {
  const source = await readFile(resumeRoutePath, "utf8");

  assert.match(source, /export const GET/);
  assert.match(source, /requestBackend\(["']\/resume["']/);
  assert.match(source, /application\/pdf/);
  assert.match(source, /등록된 이력서 PDF가 없습니다/);
  assert.match(source, /filename="portfolio\.pdf"/);
  assert.match(source, /content-type["']:\s*["']text\/html; charset=utf-8["']/);
});
