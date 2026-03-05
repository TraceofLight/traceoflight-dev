import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const indexRoutePath = new URL("../src/pages/internal-api/series.ts", import.meta.url);
const bySlugRoutePath = new URL("../src/pages/internal-api/series/[slug].ts", import.meta.url);
const reorderRoutePath = new URL("../src/pages/internal-api/series/[slug]/posts.ts", import.meta.url);

test("internal-api series routes mirror backend series contract", async () => {
  const [indexSource, bySlugSource, reorderSource] = await Promise.all([
    readFile(indexRoutePath, "utf8"),
    readFile(bySlugRoutePath, "utf8"),
    readFile(reorderRoutePath, "utf8"),
  ]);

  assert.match(indexSource, /export const GET/);
  assert.match(indexSource, /export const POST/);
  assert.match(indexSource, /requestBackend\(`\/series\$\{query\}`/);

  assert.match(bySlugSource, /export const GET/);
  assert.match(bySlugSource, /export const PUT/);
  assert.match(bySlugSource, /export const DELETE/);
  assert.match(bySlugSource, /requestBackend\(`\/series\/\$\{slug\}\$\{query\}`/);

  assert.match(reorderSource, /export const PUT/);
  assert.match(reorderSource, /requestBackend\(`\/series\/\$\{slug\}\/posts\$\{query\}`/);
});
