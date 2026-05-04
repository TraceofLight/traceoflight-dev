import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const contentConfigPath = new URL("../src/content.config.ts", import.meta.url);
const contentSourcePath = new URL("../src/lib/content-source.ts", import.meta.url);
const coverMediaLibPath = new URL("../src/lib/cover-media.ts", import.meta.url);
const backendApiPath = new URL("../src/lib/backend-api.ts", import.meta.url);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);
const seriesDbPath = new URL("../src/lib/series-db.ts", import.meta.url);
const blogPostLayoutPath = new URL("../src/layouts/BlogPost.astro", import.meta.url);
const blogIndexPath = new URL("../src/pages/[locale]/blog/index.astro", import.meta.url);
const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);
const seriesCardPath = new URL("../src/components/SeriesCard.astro", import.meta.url);
const homePagePath = new URL("../src/pages/[locale]/index.astro", import.meta.url);
const seriesIndexPath = new URL("../src/pages/[locale]/series/index.astro", import.meta.url);
const seriesDetailPath = new URL("../src/pages/[locale]/series/[slug].astro", import.meta.url);
const seriesAdminPanelPath = new URL(
  "../src/components/public/SeriesAdminPanel.tsx",
  import.meta.url,
);

test("cover naming replaces the old highlight terminology across public content rendering", async () => {
  const sources = await Promise.all([
    readFile(contentConfigPath, "utf8"),
    readFile(contentSourcePath, "utf8"),
    readFile(blogDbPath, "utf8"),
    readFile(blogPostLayoutPath, "utf8"),
    readFile(blogIndexPath, "utf8"),
    readFile(homePagePath, "utf8"),
    readFile(seriesDetailPath, "utf8"),
    readFile(seriesAdminPanelPath, "utf8"),
  ]);

  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /H\u0065roMediaImage|h\u0065ro-media|h\u0065roRoleTokens|series-h\u0065ro/i,
    );
  }
});

test("placeholder images also route through browser-sized cover image URLs", async () => {
  const [
    postCardSource,
    blogIndexSource,
    seriesIndexSource,
    seriesDetailSource,
    seriesCardSource,
  ] =
    await Promise.all([
      readFile(postCardPath, "utf8"),
      readFile(blogIndexPath, "utf8"),
      readFile(seriesIndexPath, "utf8"),
      readFile(seriesDetailPath, "utf8"),
      readFile(seriesCardPath, "utf8"),
    ]);

  assert.match(postCardSource, /toBrowserImageUrl\(fallbackCoverImage,\s*\{/);
  assert.match(postCardSource, /fit:\s*"inside"/);
  assert.match(
    blogIndexSource,
    /toBrowserImageUrl\((?:["']\/images\/empty-article-image\.png["']|DEFAULT_ARTICLE_IMAGE)/,
  );
  assert.match(blogIndexSource, /fit:\s*"inside"/);
  assert.match(seriesIndexSource, /toBrowserImageUrl\(defaultSeriesCoverImage,\s*\{/);
  assert.match(seriesIndexSource, /fit:\s*"cover"/);
  assert.match(seriesDetailSource, /toBrowserImageUrl\(defaultSeriesCoverImage,\s*\{/);
  assert.match(seriesDetailSource, /toBrowserImageUrl\(defaultSeriesPostCoverImage,\s*\{/);
  assert.match(seriesDetailSource, /fit:\s*"cover"/);
  assert.match(seriesCardSource, /toBrowserImageUrl\(fallbackCoverImage,\s*\{/);
  assert.match(seriesCardSource, /fit:\s*"inside"/);
});

test("home intro section uses separate copy and profile panels with centered profile space", async () => {
  const source = await readFile(homePagePath, "utf8");

  assert.match(source, /import \{ Image \} from "astro:assets";/);
  assert.match(source, /id="home-intro-copy-panel"/);
  assert.match(source, /id="home-intro-profile-panel"/);
  assert.match(source, /id="home-intro-profile-frame"/);
  assert.match(source, /lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(320px,0\.65fr\)\]/);
  assert.match(source, /const topMediaCopyPanelClass =/);
  assert.match(source, /id="home-intro-copy-panel"[\s\S]*class=\{`grid h-full content-center gap-6 \$\{topMediaCopyPanelClass\}`\}/);
  assert.match(source, /class="flex h-full items-center justify-center px-4 py-2 sm:px-6 sm:py-4"/);
  assert.match(source, /space-y-2\.5 text-base leading-\[1\.65\] text-muted-foreground sm:text-lg sm:leading-\[1\.7\]/);
  assert.match(source, /id="home-intro-profile-frame"[\s\S]*class="aspect-square w-full max-w-\[18rem\] sm:max-w-\[19rem\]"/);
  assert.doesNotMatch(source, /flex h-full w-full items-center justify-center rounded-\[2\.1rem\] border border-white\/80 bg-white\/90 p-6/);
  assert.match(source, /class="h-full w-full object-contain"/);
  assert.match(source, /src=\{profileImage\}/);
  assert.match(source, /const primaryOutlineActionClass = PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS;/);
  assert.match(source, /<a class=\{primaryOutlineActionClass\} href=\{`\/\$\{locale\}\/projects\/`\}>/);
  assert.match(source, /<a class=\{primaryOutlineActionClass\} href=\{`\/\$\{locale\}\/blog\/`\}>/);
  assert.doesNotMatch(source, /h\u0065roRoleTokens/);
});

test("db-backed posts and series normalize blank cover urls before fallback selection", async () => {
  const [coverMediaSource, backendApiSource, blogDbSource, seriesDbSource] = await Promise.all([
    readFile(coverMediaLibPath, "utf8"),
    readFile(backendApiPath, "utf8"),
    readFile(blogDbPath, "utf8"),
    readFile(seriesDbPath, "utf8"),
  ]);

  assert.match(coverMediaSource, /export function normalizeOptionalImageUrl\(/);
  assert.match(backendApiSource, /export function resolveBackendAssetUrl\(/);
  assert.match(backendApiSource, /if \(normalizedPath\.startsWith\("\/"\)\) \{\s*return normalizedPath;/);
  assert.match(backendApiSource, /parsed\.pathname\.startsWith\("\/media\/"\)/);
  assert.match(backendApiSource, /return `\$\{parsed\.pathname\}\$\{parsed\.search\}\$\{parsed\.hash\}`;/);
  assert.match(blogDbSource, /const normalizedCoverImageUrl = normalizeOptionalImageUrl\(post\.cover_image_url\)/);
  assert.match(blogDbSource, /const resolvedCoverImageUrl = resolveBackendAssetUrl\(normalizedCoverImageUrl\)/);
  assert.match(blogDbSource, /coverImageUrl: resolvedCoverImageUrl/);
  assert.match(blogDbSource, /coverMedia: normalizeCoverMedia\(resolvedCoverImageUrl\)/);
  assert.match(seriesDbSource, /const normalizedCoverImageUrl = normalizeOptionalImageUrl\(row\.cover_image_url\)/);
  assert.match(seriesDbSource, /coverImageUrl: resolveBackendAssetUrl\(normalizedCoverImageUrl\)/);
});

test("series cards and sidebars route db cover images through browser-sized urls", async () => {
  const [seriesCardSource, seriesDetailSource, blogPostLayoutSource] = await Promise.all([
    readFile(seriesCardPath, "utf8"),
    readFile(seriesDetailPath, "utf8"),
    readFile(blogPostLayoutPath, "utf8"),
  ]);

  assert.match(seriesCardSource, /const resolvedCoverImageSrc = series\.coverImageUrl[\s\S]*\?/);
  assert.match(seriesCardSource, /toBrowserImageUrl\(series\.coverImageUrl,\s*\{/);
  assert.match(seriesCardSource, /const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;/);
  assert.match(seriesCardSource, /imageHeight = (640|IMAGE_SIZES\.postCard\.height)/);
  assert.match(seriesCardSource, /onerror=\{coverImageFallbackOnError\}/);
  assert.match(seriesCardSource, /src=\{resolvedCoverImageSrc\}/);
  assert.match(seriesDetailSource, /const resolvedSeriesCoverImageSrc = series\?\.coverImageUrl[\s\S]*\?/);
  assert.match(seriesDetailSource, /const resolvedSeriesPostCoverImageSrc = post\.coverImageUrl[\s\S]*\?/);
  assert.match(seriesDetailSource, /toBrowserImageUrl\(series\.coverImageUrl,\s*\{/);
  assert.match(seriesDetailSource, /toBrowserImageUrl\(post\.coverImageUrl,\s*\{/);
  assert.match(seriesDetailSource, /onerror=\{seriesCoverImageFallbackOnError\}/);
  assert.match(seriesDetailSource, /onerror=\{seriesPostCoverImageFallbackOnError\}/);
  assert.match(blogPostLayoutSource, /const resolvedSeriesPostCoverImageSrc = seriesPost\.coverImageUrl[\s\S]*\?/);
  assert.match(blogPostLayoutSource, /toBrowserImageUrl\(seriesPost\.coverImageUrl,\s*\{/);
  assert.match(blogPostLayoutSource, /onerror=\{seriesPostCoverImageFallbackOnError\}/);
});
