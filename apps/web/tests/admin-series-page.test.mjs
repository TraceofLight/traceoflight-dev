import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { test } from "node:test";

const adminSeriesIndexPath = new URL(
  "../src/pages/admin/series/index.astro",
  import.meta.url,
);
const adminSeriesNewPath = new URL(
  "../src/pages/admin/series/new.astro",
  import.meta.url,
);

test("admin series manager pages are removed", async () => {
  await assert.rejects(access(adminSeriesIndexPath));
  await assert.rejects(access(adminSeriesNewPath));
});
