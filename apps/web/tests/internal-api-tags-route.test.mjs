import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const tagsRoutePath = new URL(
  "../src/pages/internal-api/tags.ts",
  import.meta.url,
);
const tagsBySlugRoutePath = new URL(
  "../src/pages/internal-api/tags/[slug].ts",
  import.meta.url,
);

test("internal-api tags route supports get and post proxy", async () => {
  const source = await readFile(tagsRoutePath, "utf8");

  assert.match(source, /export const GET/);
  assert.match(source, /export const POST/);
  assert.match(source, /requestBackend\(`\/tags\$\{query\}`/);
});

test("internal-api tags by slug route supports patch and delete proxy", async () => {
  const source = await readFile(tagsBySlugRoutePath, "utf8");

  assert.match(source, /export const PATCH/);
  assert.match(source, /export const DELETE/);
  assert.match(source, /requestBackend\(`\/tags\/\$\{slug\}`/);
});
