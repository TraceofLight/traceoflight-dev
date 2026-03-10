import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const seriesPagePath = new URL(
  "../src/pages/series/index.astro",
  import.meta.url,
);
const seriesCardPath = new URL(
  "../src/components/SeriesCard.astro",
  import.meta.url,
);
const aboutPagePath = new URL("../src/pages/about.astro", import.meta.url);
const headerConstPath = new URL("../src/consts.ts", import.meta.url);

test("series index page renders archive list and links to detail route", async () => {
  const [source, cardSource] = await Promise.all([
    readFile(seriesPagePath, "utf8"),
    readFile(seriesCardPath, "utf8"),
  ]);

  assert.match(source, /id="series-archive"/);
  assert.match(source, /import SeriesCard from ["']\.\.\/\.\.\/components\/SeriesCard(?:\.astro)?["']/);
  assert.match(
    source,
    /<SeriesCard[\s\S]*series=\{series\}[\s\S]*imageWidth=\{960\}[\s\S]*imageHeight=\{640\}[\s\S]*fallbackCoverImageSrc=\{defaultSeriesCoverImageSrc\}[\s\S]*\/>/,
  );
  assert.match(source, /<h1[\s\S]*?>\s*Series\s*<\/h1>/);
  assert.match(cardSource, /rounded-\[2rem\] border border-white\/80 bg-white\/95 p-3 shadow-\[0_28px_80px_rgba\(15,23,42,0\.10\)\]/);
  assert.match(cardSource, /const mediaFrameClass = "relative h-56 overflow-hidden rounded-\[1\.5rem\] bg-slate-100 sm:h-64";/);
  assert.match(cardSource, /<img[\s\S]*class="absolute inset-0 block !h-full !w-full !max-w-none object-cover object-center/);
  assert.match(cardSource, /onerror=\{coverImageFallbackOnError\}/);
  assert.match(cardSource, /object-cover object-center/);
  assert.match(cardSource, /FormattedDate/);
  assert.match(cardSource, /href=\{`\/series\/\$\{series\.slug\}`\}/);
  assert.match(source, /\/images\/empty-series-image\.png/);
  assert.match(source, /TraceofLight의 다양한 이야기를 주제별로 엮은 서고/);
  assert.match(source, /<header class="space-y-4">/);
  assert.doesNotMatch(
    source,
    /<header[\s\S]*rounded-\[2\.25rem\] border border-white\/80 bg-white\/92 p-6 shadow-\[0_24px_60px_rgba\(15,23,42,0\.08\)\]/,
  );
  assert.match(source, /아직 등록된 시리즈가 없습니다/);
  assert.doesNotMatch(source, /주제별로 읽는 TraceofLight/);
  assert.doesNotMatch(source, /Archive Snapshot/);
  assert.doesNotMatch(source, /Admin view/);
  assert.doesNotMatch(source, /Public view/);
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
