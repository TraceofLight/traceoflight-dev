import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const detailPagePath = new URL("../src/pages/series/[slug].astro", import.meta.url);
const stylePath = new URL("../src/styles/components/blog.css", import.meta.url);

test("series detail page uses slug route and ordered series posts", async () => {
  const source = await readFile(detailPagePath, "utf8");

  assert.match(source, /const slug = Astro\.params\.slug \?\? ''/);
  assert.match(source, /getSeriesBySlug/);
  assert.match(source, /series\.posts/);
  assert.match(source, /data-series-order/);
  assert.match(source, /series-start-link/);
});

test("series styles are included in blog component stylesheet", async () => {
  const source = await readFile(stylePath, "utf8");

  assert.match(source, /\.series-archive/);
  assert.match(source, /\.series-card/);
  assert.match(source, /\.series-detail/);
  assert.match(source, /\.series-post-list/);
});
