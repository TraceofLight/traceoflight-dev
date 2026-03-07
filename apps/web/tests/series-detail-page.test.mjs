import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const detailPagePath = new URL(
  "../src/pages/series/[slug].astro",
  import.meta.url,
);
const seriesAdminPanelPath = new URL(
  "../src/components/public/SeriesAdminPanel.tsx",
  import.meta.url,
);
const seriesReorderListPath = new URL(
  "../src/components/public/SeriesReorderList.tsx",
  import.meta.url,
);

test("series detail page mounts a React admin panel while keeping the public series hero", async () => {
  const source = await readFile(detailPagePath, "utf8");

  assert.match(source, /const slug = Astro\.params\.slug \?\? (?:''|"")/);
  assert.match(source, /ADMIN_ACCESS_COOKIE/);
  assert.match(source, /verifyAccessToken/);
  assert.match(source, /getSeriesBySlug/);
  assert.match(source, /series\.posts/);
  assert.match(source, /id="series-start-link"/);
  assert.match(source, /rounded-\[2rem\] border border-border\/60 bg-card/);
  assert.match(source, /시리즈 시작하기/);
  assert.match(source, />\s*시리즈 목록\s*</);
  assert.match(
    source,
    /import SeriesAdminPanel from ["']\.\.\/\.\.\/components\/public\/SeriesAdminPanel["']/,
  );
  assert.match(
    source,
    /isAdminViewer && \([\s\S]*<SeriesAdminPanel[\s\S]*client:load/,
  );
  assert.match(source, /\/images\/empty-series-image\.png/);
  assert.doesNotMatch(source, /function initializeSeriesAdminControls\(\)/);
  assert.doesNotMatch(source, /createUploadBundle/);
  assert.doesNotMatch(source, /class="series-detail-hero-card"/);
  assert.doesNotMatch(source, /updated\s*\{/);
  assert.doesNotMatch(source, /Series Posts/);
  assert.doesNotMatch(
    source,
    /순서대로 읽으며 시리즈의 흐름을 따라갈 수 있습니다\./,
  );
  assert.doesNotMatch(source, /시리즈 목록으로 돌아가기/);
});

test("series admin panel keeps metadata save, upload, and reorder flows in React islands", async () => {
  const [panelSource, reorderSource] = await Promise.all([
    readFile(seriesAdminPanelPath, "utf8"),
    readFile(seriesReorderListPath, "utf8"),
  ]);

  assert.match(
    panelSource,
    /import \{ createUploadBundle \} from ["']\.\.\/\.\.\/lib\/admin\/new-post-page\/upload["']/,
  );
  assert.match(
    panelSource,
    /import SeriesReorderList from ["']\.\/SeriesReorderList["']/,
  );
  assert.match(panelSource, /id="series-admin-panel"/);
  assert.match(panelSource, /id="series-admin-cover-upload-trigger"/);
  assert.match(panelSource, /id="series-admin-cover-upload-input"/);
  assert.match(panelSource, /id="series-admin-save-meta"/);
  assert.match(
    panelSource,
    /\/internal-api\/series\/\$\{encodeURIComponent\(seriesSlug\)\}/,
  );
  assert.match(reorderSource, /data-series-move="up"/);
  assert.match(reorderSource, /data-series-move="down"/);
  assert.match(reorderSource, /id="series-admin-save-order"/);
  assert.doesNotMatch(
    panelSource,
    /설명과 썸네일을 저장하면 공개 시리즈 헤더에 바로 반영됩니다\./,
  );
  assert.doesNotMatch(
    panelSource,
    /공개 페이지에서 바로 메타데이터와 썸네일, 글 순서를 조정합니다\./,
  );
  assert.doesNotMatch(panelSource, /드래그 앤 드롭도 지원합니다\./);
  assert.doesNotMatch(
    panelSource,
    /빈 값이면 기본 시리즈 이미지를 사용합니다\./,
  );
  assert.doesNotMatch(
    reorderSource,
    /순서를 조정한 뒤 저장하면 시리즈 시작 글과 목록 순서가 함께 반영됩니다\./,
  );
});
