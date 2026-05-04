import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const seriesPagePath = new URL(
  "../src/pages/[locale]/series/index.astro",
  import.meta.url,
);
const seriesCardPath = new URL(
  "../src/components/SeriesCard.astro",
  import.meta.url,
);
const headerConstPath = new URL("../src/consts.ts", import.meta.url);
const seriesOrderPanelPath = new URL(
  "../src/components/public/SeriesOrderPanel.tsx",
  import.meta.url,
);

test("series index page renders archive list and links to detail route", async () => {
  const [source, cardSource, orderPanelSource] = await Promise.all([
    readFile(seriesPagePath, "utf8"),
    readFile(seriesCardPath, "utf8"),
    readFile(seriesOrderPanelPath, "utf8"),
  ]);

  assert.match(source, /id="series-archive"/);
  assert.match(source, /import SeriesCard from ["']\.\.\/\.\.\/\.\.\/components\/SeriesCard(?:\.astro)?["']/);
  // The series index page can rely on SeriesCard's default postCard
  // dimensions and only pass series, fallbackCoverImageSrc, and locale.
  assert.match(
    source,
    /<SeriesCard[\s\S]*series=\{s\}[\s\S]*fallbackCoverImageSrc=\{defaultSeriesCoverImageSrc\}[\s\S]*locale=\{locale\}[\s\S]*\/>/,
  );
  // Heading text is sourced from the dictionary (`t.nav.series`).
  assert.match(source, /<h1[\s\S]*?>\s*\{t\.nav\.series\}\s*<\/h1>/);
  assert.doesNotMatch(source, /max-w-6xl/);
  assert.match(source, /class="flex w-full flex-col gap-8"/);
  assert.match(
    cardSource,
    /import \{[\s\S]*buildImageFallbackOnError[\s\S]*toBrowserImageUrl[\s\S]*\} from "\.\.\/lib\/cover-media";/,
  );
  assert.match(
    cardSource,
    /import \{[\s\S]*PUBLIC_HOVER_CARD_CLASS[\s\S]*PUBLIC_MEDIA_FRAME_CLASS[\s\S]*\} from "\.\.\/lib\/ui-effects";/,
  );
  assert.match(cardSource, /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/);
  assert.match(cardSource, /class=\{`flex h-full flex-col p-3 \$\{PUBLIC_HOVER_CARD_CLASS\}`\}/);
  assert.match(cardSource, /imageWidth = (960|IMAGE_SIZES\.postCard\.width)/);
  assert.match(cardSource, /imageHeight = (640|IMAGE_SIZES\.postCard\.height)/);
  assert.match(cardSource, /toBrowserImageUrl\(series\.coverImageUrl,\s*\{[\s\S]*fit:\s*"inside"/);
  assert.match(cardSource, /<img[\s\S]*class="absolute inset-0 block !h-full !w-full !max-w-none object-cover object-center/);
  assert.match(cardSource, /onerror=\{coverImageFallbackOnError\}/);
  assert.match(cardSource, /object-cover object-center/);
  assert.match(cardSource, /FormattedDate/);
  // The card builds the href from an optional `locale` prop, with `/series/<slug>`
  // as a graceful fallback when no locale is provided.
  assert.match(
    cardSource,
    /seriesHref\s*=\s*locale\s*\?\s*`\/\$\{locale\}\/series\/\$\{series\.slug\}`\s*:\s*`\/series\/\$\{series\.slug\}`/,
  );
  assert.match(cardSource, /href=\{seriesHref\}/);
  assert.match(source, /(\/images\/empty-series-image\.png|DEFAULT_SERIES_IMAGE)/);
  // The page-meta description is unchanged (used by SEO/head).
  assert.match(source, /주제별로 정리한 TraceofLight 시리즈 모음/);
  // The visible subtitle paragraph (under the H1) is the user-authored copy
  // that must not be silently dropped by i18n refactors. It now reads from
  // the dictionary so each locale can carry its own translation.
  assert.match(source, /\{t\.home\.seriesArchiveSubtitle\}/);
  assert.match(source, /<header class="space-y-4 text-center">/);
  assert.match(source, /SeriesOrderPanel/);
  assert.match(source, /isAdminViewer && \(/);
  assert.match(source, /<SeriesOrderPanel client:load series=\{series\} \/>/);
  assert.match(orderPanelSource, /title="시리즈 순서 조정"/);
  assert.match(orderPanelSource, /\/internal-api\/series\/order/);
  assert.doesNotMatch(
    source,
    /<header[\s\S]*rounded-\[2\.25rem\] border border-white\/80 bg-white\/92 p-6 shadow-\[0_24px_60px_rgba\(15,23,42,0\.08\)\]/,
  );
  // Empty-state copy now goes through the dictionary.
  assert.match(source, /\{t\.empty\.noSeries\}/);
  assert.doesNotMatch(source, /주제별로 읽는 TraceofLight/);
  assert.doesNotMatch(source, /Archive Snapshot/);
  assert.doesNotMatch(source, /Admin view/);
  assert.doesNotMatch(source, /Public view/);
});

test("top navigation exposes series instead of about", async () => {
  const source = await readFile(headerConstPath, "utf8");

  assert.match(source, /href:\s*'\/series',\s*label:\s*'Series'/);
  assert.doesNotMatch(source, /href:\s*'\/about',\s*label:\s*'About'/);
});
