import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const coverMediaLibPath = new URL("../src/lib/cover-media.ts", import.meta.url);
const coverMediaComponentPath = new URL(
  "../src/components/CoverMediaImage.astro",
  import.meta.url,
);
const mediaRoutePath = new URL(
  "../src/pages/internal-api/media/browser-image.ts",
  import.meta.url,
);
const postCardPath = new URL("../src/components/PostCard.astro", import.meta.url);

test("cover media lib exposes a browser-sized URL helper for native images", async () => {
  const source = await readFile(coverMediaLibPath, "utf8");

  assert.match(source, /export function toBrowserImageUrl\(/);
  assert.match(source, /new URLSearchParams\(/);
  assert.match(source, /pathname:\s*["']\/internal-api\/media\/browser-image["']/);
  assert.match(source, /params\.set\(["']w["']/);
  assert.match(source, /params\.set\(["']h["']/);
});

test("cover media component routes native images through the browser cache endpoint", async () => {
  const source = await readFile(coverMediaComponentPath, "utf8");

  assert.match(
    source,
    /import \{ toBrowserImageUrl, type CoverMedia \} from "\.\.\/lib\/cover-media";/,
  );
  assert.match(source, /const browserSizedSrc =/);
  assert.match(source, /toBrowserImageUrl\(media\.src,\s*\{/);
  assert.match(source, /decoding="async"/);
  assert.match(source, /width=\{width\}/);
  assert.match(source, /height=\{height\}/);
});

test("browser image route resizes remote originals with cache headers", async () => {
  const source = await readFile(mediaRoutePath, "utf8");

  assert.match(source, /import sharp from ["']sharp["'];/);
  assert.match(source, /export const GET: APIRoute/);
  assert.match(source, /fetch\(sourceUrl/);
  assert.match(source, /sharp\(Buffer\.from\(arrayBuffer\)\)/);
  assert.match(source, /resize\(\{/);
  assert.match(source, /fit:\s*["']cover["']/);
  assert.match(source, /"cache-control":\s*"public, max-age=31536000, immutable"/);
});

test("browser image route allows same-origin relative assets while still guarding blocked hosts", async () => {
  const source = await readFile(mediaRoutePath, "utf8");

  assert.match(source, /const requestOrigin = new URL\(request\.url\)\.origin;/);
  assert.match(source, /const isRelativeSource = trimmedSource\.startsWith\("\/"\);/);
  assert.match(source, /if \(!isRelativeSource && isBlockedHostname\(resolvedUrl\.hostname\)\)/);
});

test("post card uses a toss-team-like tall media block and fully filled imagery", async () => {
  const source = await readFile(postCardPath, "utf8");

  assert.match(
    source,
    /rounded-\[2rem\] border border-white\/80 bg-white\/95 p-3 shadow-\[0_28px_80px_rgba\(15,23,42,0\.10\)\]/,
  );
  assert.match(source, /aspect-\[4\/5\]/);
  assert.match(source, /min-h-\[18rem\]/);
  assert.match(source, /sm:min-h-\[22rem\]/);
  assert.match(source, /sizes="\(max-width: 768px\) 100vw, \(max-width: 1280px\) 50vw, 33vw"/);
  assert.match(source, /object-cover object-top/);
  assert.match(source, /overflow-hidden rounded-\[1\.5rem\]/);
  assert.doesNotMatch(source, /aspect-\[16\/9\]/);
});
