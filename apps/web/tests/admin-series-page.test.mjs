import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const adminHomePath = new URL("../src/pages/admin/index.astro", import.meta.url);
const adminSeriesIndexPath = new URL("../src/pages/admin/series/index.astro", import.meta.url);
const adminSeriesNewPath = new URL("../src/pages/admin/series/new.astro", import.meta.url);

test("admin dashboard links to series manager", async () => {
  const source = await readFile(adminHomePath, "utf8");
  assert.match(source, /href="\/admin\/series"/);
});

test("admin series pages include list and create ui without edit/delete controls", async () => {
  const [indexSource, newSource] = await Promise.all([
    readFile(adminSeriesIndexPath, "utf8"),
    readFile(adminSeriesNewPath, "utf8"),
  ]);

  assert.match(indexSource, /id="admin-series-list"/);
  assert.doesNotMatch(indexSource, /data-series-delete/);
  assert.doesNotMatch(indexSource, /\/admin\/series\/.*\/edit/);
  assert.match(indexSource, /\/admin\/series\/new/);

  assert.match(newSource, /id="admin-series-form"/);
  assert.match(newSource, /name="slug"/);
  assert.match(newSource, /name="title"/);
  assert.match(newSource, /name="description"/);
  assert.match(newSource, /name="post_slugs"/);
  assert.match(newSource, /window\.location\.assign\(\"\/admin\/series\"\)/);
});
