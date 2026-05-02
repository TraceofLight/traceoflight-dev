import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const baseLayoutPath = new URL("../src/layouts/BaseLayout.astro", import.meta.url);

test("base layout loads ga4 visitor summary server-side and forwards it into footer metadata", async () => {
  const source = await readFile(baseLayoutPath, "utf8");

  assert.match(source, /getGa4VisitorSummary/);
  assert.match(source, /await getGa4VisitorSummary\(\)/);
  assert.match(source, /<Footer visitorSummary=\{visitorSummary\} \/>/);
  // FloatingUtilityButtons is now a static Astro component (no client directive needed).
  assert.match(source, /<FloatingUtilityButtons \/>/);
  assert.doesNotMatch(source, /<FloatingUtilityButtons[\s\S]*visitorSummary=\{visitorSummary\}[\s\S]*\/>/);
});
