import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const seriesPagePath = new URL(
  "../src/pages/series/index.astro",
  import.meta.url,
);
const aboutPagePath = new URL("../src/pages/about.astro", import.meta.url);
const headerConstPath = new URL("../src/consts.ts", import.meta.url);

test("series index page renders archive list and links to detail route", async () => {
  const source = await readFile(seriesPagePath, "utf8");

  assert.match(source, /id="series-archive"/);
  assert.match(
    source,
    /rounded-3xl border border-white\/80 bg-white\/92 text-card-foreground shadow-\[0_24px_60px_rgba\(15,23,42,0\.08\)\]/,
  );
  assert.match(source, /<h1[\s\S]*?>\s*Series\s*<\/h1>/);
  assert.match(source, /FormattedDate/);
  assert.match(source, /href=\{`\/series\/\$\{series\.slug\}`\}/);
  assert.match(source, /\/images\/empty-series-image\.png/);
  assert.match(source, /TraceofLight의 다양한 이야기를 주제별로 엮은 서고/);
  assert.match(source, /아직 등록된 시리즈가 없습니다/);
  assert.doesNotMatch(source, /주제별로 읽는 TraceofLight/);
  assert.doesNotMatch(source, /Archive Snapshot/);
  assert.doesNotMatch(source, /Admin view/);
  assert.doesNotMatch(source, /Public view/);
  assert.doesNotMatch(source, /formatDateLabel/);
});

test("about page is repurposed as a series alias redirect", async () => {
  const source = await readFile(aboutPagePath, "utf8");

  assert.match(source, /Astro\.redirect\('\/series'\)/);
});

test("top navigation exposes series instead of about", async () => {
  const source = await readFile(headerConstPath, "utf8");

  assert.match(source, /href:\s*'\/series',\s*label:\s*'Series'/);
  assert.doesNotMatch(source, /href:\s*'\/about',\s*label:\s*'About'/);
});
