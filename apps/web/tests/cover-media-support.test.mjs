import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const contentConfigPath = new URL("../src/content.config.ts", import.meta.url);
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
const contentSourcePath = new URL("../src/lib/content-source.ts", import.meta.url);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);

test("blog content schema accepts both optimized images and string cover paths", async () => {
  const source = await readFile(contentConfigPath, "utf8");

  assert.match(
    source,
    /coverImage:\s*z\.union\(\[image\(\),\s*z\.string\(\)\]\)\.optional\(\)/,
  );
});

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
  assert.match(componentSource, /const nativeFallbackOnError =/);
  assert.match(componentSource, /onerror=\{nativeFallbackOnError\}/);
});

test("post cards consume the shared cover media renderer instead of inline branching", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(source, /import CoverMediaImage from "\.\/CoverMediaImage\.astro";/);
  assert.match(source, /post\.coverMedia \?/);
  assert.match(source, /<CoverMediaImage/);
  assert.doesNotMatch(source, /typeof post\.(coverImage|coverMedia) === 'string'/);
});

test("blog post layout reuses shared cover media helpers for rendering and og image fallback", async () => {
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
  assert.match(source, /image=\{getCoverMediaMetadata\(coverMedia\)\}/);
  assert.match(source, /<CoverMediaImage[\s\S]*media=\{coverMedia\}[\s\S]*alt=\{title\}/);
  assert.doesNotMatch(source, /typeof coverImage === 'string'/);
});

test("content and db sources both expose cover media through the shared type", async () => {
  const [contentSource, blogDbSource] = await Promise.all([
    readFile(contentSourcePath, "utf8"),
    readFile(blogDbPath, "utf8"),
  ]);

  assert.match(contentSource, /import \{ normalizeCoverMedia, type CoverMedia \} from '\.\/cover-media';/);
  assert.match(contentSource, /coverMedia\?: CoverMedia;/);
  assert.match(contentSource, /coverMedia:\s*normalizeCoverMedia\(post\.data\.coverImage\)/);
  assert.match(blogDbSource, /import \{[\s\S]*normalizeCoverMedia[\s\S]*normalizeOptionalImageUrl[\s\S]*type CoverMedia[\s\S]*\} from '\.\/cover-media';/);
  assert.match(blogDbSource, /import \{ requestBackend, resolveBackendAssetUrl \} from '\.\/backend-api';/);
  assert.match(blogDbSource, /coverMedia\?: CoverMedia;/);
  assert.match(blogDbSource, /const normalizedCoverImageUrl = normalizeOptionalImageUrl\(post\.cover_image_url\)/);
  assert.match(blogDbSource, /const resolvedCoverImageUrl = resolveBackendAssetUrl\(normalizedCoverImageUrl\)/);
  assert.match(blogDbSource, /coverMedia:\s*normalizeCoverMedia\(resolvedCoverImageUrl\)/);
});
