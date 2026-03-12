import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const baseLayoutPath = new URL("../src/layouts/BaseLayout.astro", import.meta.url);

test("base layout loads ga4 visitor summary server-side and forwards it into footer metadata", async () => {
  const source = await readFile(baseLayoutPath, "utf8");

  assert.match(source, /getGa4VisitorSummary/);
  assert.match(source, /await getGa4VisitorSummary\(\)/);
  assert.match(source, /<Footer visitorSummary=\{visitorSummary\} \/>/);
  assert.match(source, /FloatingUtilityButtons client:only="react"/);
  assert.doesNotMatch(source, /<FloatingUtilityButtons client:only="react" visitorSummary=\{visitorSummary\} \/>/);
});
