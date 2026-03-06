import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const contentConfigPath = new URL("../src/content.config.ts", import.meta.url);
const heroMediaLibPath = new URL("../src/lib/hero-media.ts", import.meta.url);
const heroMediaComponentPath = new URL(
  "../src/components/HeroMediaImage.astro",
  import.meta.url,
);
const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);
const blogPostLayoutPath = new URL(
  "../src/layouts/BlogPost.astro",
  import.meta.url,
);
const contentSourcePath = new URL("../src/lib/content-source.ts", import.meta.url);
const blogDbPath = new URL("../src/lib/blog-db.ts", import.meta.url);

test("blog content schema accepts both optimized images and string hero paths", async () => {
  const source = await readFile(contentConfigPath, "utf8");

  assert.match(
    source,
    /heroImage:\s*z\.union\(\[image\(\),\s*z\.string\(\)\]\)\.optional\(\)/,
  );
});

test("hero media support is centralized in a shared model and renderer", async () => {
  await access(heroMediaLibPath);
  await access(heroMediaComponentPath);

  const [libSource, componentSource] = await Promise.all([
    readFile(heroMediaLibPath, "utf8"),
    readFile(heroMediaComponentPath, "utf8"),
  ]);

  assert.match(libSource, /export type HeroMediaSource/);
  assert.match(libSource, /export type HeroMedia/);
  assert.match(libSource, /export function normalizeHeroMedia/);
  assert.match(libSource, /export function getHeroMediaMetadata/);
  assert.match(componentSource, /import \{ Image \} from "astro:assets";/);
  assert.match(componentSource, /media:\s*HeroMedia/);
});

test("post cards consume the shared hero media renderer instead of inline branching", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(source, /import HeroMediaImage from "\.\/HeroMediaImage\.astro";/);
  assert.match(source, /post\.heroMedia \?/);
  assert.match(source, /<HeroMediaImage/);
  assert.doesNotMatch(source, /typeof post\.(heroImage|heroMedia) === 'string'/);
});

test("blog post layout reuses shared hero media helpers for rendering and og image fallback", async () => {
  const source = await readFile(blogPostLayoutPath, "utf8");

  assert.match(source, /import HeroMediaImage from '\.\.\/components\/HeroMediaImage\.astro';/);
  assert.match(source, /import \{[\s\S]*getHeroMediaMetadata[\s\S]*normalizeHeroMedia[\s\S]*\} from '\.\.\/lib\/hero-media';/);
  assert.match(source, /const heroMedia = normalizeHeroMedia\(heroImage\);/);
  assert.match(source, /image=\{getHeroMediaMetadata\(heroMedia\)\}/);
  assert.match(source, /<HeroMediaImage className="post-hero" media=\{heroMedia\} alt=\{title\}/);
  assert.doesNotMatch(source, /typeof heroImage === 'string'/);
});

test("content and db sources both expose hero media through the shared type", async () => {
  const [contentSource, blogDbSource] = await Promise.all([
    readFile(contentSourcePath, "utf8"),
    readFile(blogDbPath, "utf8"),
  ]);

  assert.match(contentSource, /import \{ normalizeHeroMedia, type HeroMedia \} from '\.\/hero-media';/);
  assert.match(contentSource, /heroMedia\?: HeroMedia;/);
  assert.match(contentSource, /heroMedia:\s*normalizeHeroMedia\(post\.data\.heroImage\)/);
  assert.match(blogDbSource, /import \{ normalizeHeroMedia, type HeroMedia \} from '\.\/hero-media';/);
  assert.match(blogDbSource, /heroMedia\?: HeroMedia;/);
  assert.match(blogDbSource, /heroMedia:\s*normalizeHeroMedia\(post\.cover_image_url\)/);
});
