import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const coverMediaLibPath = new URL("../src/lib/cover-media.ts", import.meta.url);
const coverMediaComponentPath = new URL(
  "../src/components/CoverMediaImage.astro",
  import.meta.url,
);
const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);
const blogPostLayoutPath = new URL(
  "../src/layouts/BlogPost.astro",
  import.meta.url,
);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);

test("cover media support is centralized in a shared model and renderer", async () => {
  await access(coverMediaLibPath);
  await access(coverMediaComponentPath);

  const [libSource, componentSource] = await Promise.all([
    readFile(coverMediaLibPath, "utf8"),
    readFile(coverMediaComponentPath, "utf8"),
  ]);

  assert.match(libSource, /export type CoverMediaSource/);
  assert.match(libSource, /export type CoverMedia/);
  assert.match(libSource, /export function normalizeCoverMedia/);
  assert.match(libSource, /export function getCoverMediaMetadata/);
  assert.match(libSource, /export function buildImageFallbackOnError\(/);
  assert.match(componentSource, /import \{ Image \} from "astro:assets";/);
  assert.match(componentSource, /media:\s*CoverMedia/);
  assert.match(componentSource, /fallbackSrc\?: string;/);
  assert.match(componentSource, /fit\?: "cover" \| "contain" \| "inside";/);
  assert.match(componentSource, /const nativeFallbackOnError =/);
  assert.match(componentSource, /onerror=\{nativeFallbackOnError\}/);
  assert.match(componentSource, /toBrowserImageUrl\(media\.src,\s*\{[\s\S]*fit[\s\S]*\}\)/);
});

test("post cards consume the shared cover media renderer instead of inline branching", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(source, /import CoverMediaImage from "\.\/CoverMediaImage\.astro";/);
  assert.match(source, /post\.coverMedia \?/);
  assert.match(source, /<CoverMediaImage/);
  assert.doesNotMatch(source, /typeof post\.(coverImage|coverMedia) === 'string'/);
});

test("blog post layout reuses shared cover media helpers for top media rendering and og image fallback", async () => {
  const source = await readFile(blogPostLayoutPath, "utf8");

  assert.match(
    source,
    /import CoverMediaImage from ["']\.\.\/components\/CoverMediaImage\.astro["'];/,
  );
  assert.match(
    source,
    /import \{[\s\S]*getCoverMediaMetadata[\s\S]*normalizeCoverMedia[\s\S]*\} from ["']\.\.\/lib\/cover-media["'];/,
  );
  assert.match(source, /const coverMedia = normalizeCoverMedia\(coverImage\);/);
  assert.match(source, /const topMediaImage = normalizeCoverMedia\(topMediaImageUrl \?\? coverImage\);/);
  assert.match(source, /const seoImageMetadata =/);
  assert.match(source, /image=\{seoImageMetadata\}/);
  assert.match(source, /imageUrl=\{seoImageUrl\}/);
  assert.match(source, /<CoverMediaImage[\s\S]*media=\{topMediaImage\}[\s\S]*alt=\{title\}/);
  assert.match(
    source,
    /const detailCoverWidth = (?:1400|IMAGE_SIZES\.blogPostCover\.width);/,
  );
  assert.match(
    source,
    /const detailCoverHeight = (?:1000|IMAGE_SIZES\.blogPostCover\.height);/,
  );
  assert.match(
    source,
    /toBrowserImageUrl\((?:"\/images\/empty-article-image\.png"|DEFAULT_ARTICLE_IMAGE),\s*\{[\s\S]*width:\s*detailCoverWidth,[\s\S]*height:\s*detailCoverHeight,[\s\S]*fit:\s*"inside"/,
  );
  assert.match(source, /className="mt-8 h-auto w-full rounded-3xl shadow-\[0_30px_80px_rgba\(15,23,42,0\.12\)\]"/);
  assert.match(source, /fit="inside"/);
  assert.doesNotMatch(source, /className="mt-8 aspect-\[16\/9\] w-full rounded-3xl border/);
  assert.match(source, /width=\{detailCoverWidth\}/);
  assert.match(source, /height=\{detailCoverHeight\}/);
  assert.match(source, /rounded-3xl bg-white\/96 p-5 \$\{PUBLIC_PANEL_SURFACE_CLASS\}/);
  // The order indicator is sourced from the dictionary template so each
  // locale can express the count naturally.
  assert.match(source, /t\.blogPost\.seriesProgress[\s\S]*?\.replace\(\s*"\{order\}"/);
  assert.match(source, /group grid grid-cols-\[124px_minmax\(0,1fr\)\] items-center gap-4 rounded-2xl p-3\.5 transition duration-200 hover:-translate-y-0\.5 hover:border-sky-200\/70 hover:bg-white \$\{PUBLIC_PANEL_SURFACE_SOFT_CLASS\}/);
  assert.doesNotMatch(source, /typeof coverImage === 'string'/);
});

test("db source exposes cover media through the shared type", async () => {
  const blogDbSource = await readFile(blogDbPath, "utf8");

  assert.match(blogDbSource, /import \{[\s\S]*normalizeCoverMedia[\s\S]*normalizeOptionalImageUrl[\s\S]*type CoverMedia[\s\S]*\} from '\.\/cover-media';/);
  assert.match(blogDbSource, /import \{[\s\S]*requestBackend[\s\S]*requestBackendPublic[\s\S]*resolveBackendAssetUrl[\s\S]*\} from '\.\/backend-api';/);
  assert.match(blogDbSource, /coverMedia\?: CoverMedia;/);
  assert.match(blogDbSource, /const normalizedCoverImageUrl = normalizeOptionalImageUrl\(post\.cover_image_url\)/);
  assert.match(blogDbSource, /const resolvedCoverImageUrl = resolveBackendAssetUrl\(normalizedCoverImageUrl\)/);
  assert.match(blogDbSource, /coverMedia:\s*normalizeCoverMedia\(resolvedCoverImageUrl\)/);
});
