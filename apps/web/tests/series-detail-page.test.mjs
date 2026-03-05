import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const detailPagePath = new URL("../src/pages/series/[slug].astro", import.meta.url);
const stylePath = new URL("../src/styles/components/blog.css", import.meta.url);

test("series detail page uses slug route and ordered series posts", async () => {
  const source = await readFile(detailPagePath, "utf8");

  assert.match(source, /const slug = Astro\.params\.slug \?\? ''/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /getSeriesBySlug/);
  assert.match(source, /series\.posts/);
  assert.match(source, /data-series-order/);
  assert.match(source, /series-start-link/);
  assert.match(source, /class="series-detail-hero-card"/);
  assert.match(source, /class="series-detail-hero-main"/);
  assert.match(source, /class="series-detail-hero-meta"/);
  assert.match(
    source,
    /isAdminViewer && \([\s\S]*id="series-admin-panel"[\s\S]*id="series-admin-description"/,
  );
  assert.match(source, /id="series-admin-cover-image-url"/);
  assert.match(source, /id="series-admin-save-meta"/);
  assert.match(source, /data-series-move="up"/);
  assert.match(source, /data-series-move="down"/);
  assert.match(source, /id="series-admin-save-order"/);
  assert.match(source, /function initializeSeriesAdminControls\(\)/);
  assert.match(source, /\/internal-api\/series\/\$\{encodeURIComponent\(slug\)\}/);
  assert.match(source, /\/internal-api\/series\/\$\{encodeURIComponent\(slug\)\}\/posts/);
});

test("series styles are included in blog component stylesheet", async () => {
  const source = await readFile(stylePath, "utf8");

  assert.match(source, /\.series-archive/);
  assert.match(source, /\.series-card/);
  assert.match(source, /\.series-detail/);
  assert.match(source, /\.series-post-list/);
  assert.match(source, /\.series-detail-hero-card/);
  assert.match(source, /\.series-admin-panel/);
  assert.match(source, /\.series-post-item-admin-actions/);
  assert.match(source, /\.series-post-item-reorder/);
});
