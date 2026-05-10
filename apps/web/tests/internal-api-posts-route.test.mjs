import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const bySlugPath = new URL('../src/pages/internal-api/posts/[slug].ts', import.meta.url);
const retranslatePath = new URL(
  '../src/pages/internal-api/posts/[slug]/retranslate.ts',
  import.meta.url,
);

test('internal-api posts by slug route supports get, put, delete proxy and delete action fallback', async () => {
  const source = await readFile(bySlugPath, 'utf8');

  assert.match(source, /export const GET/);
  assert.match(source, /export const PUT/);
  assert.match(source, /export const DELETE/);
  assert.match(source, /export const POST/);
  assert.match(source, /requestBackend\(`\/posts\/\$\{slug}\$\{query\}`/);
  assert.match(source, /action !== "delete"/);
  assert.match(source, /proxyDeletePostBySlug/);
});

test('internal-api post retranslation route validates locale and proxies to backend', async () => {
  const source = await readFile(retranslatePath, 'utf8');

  assert.match(source, /export const POST/);
  assert.match(source, /locale is required/);
  assert.match(source, /locale === "ko"/);
  assert.match(source, /source posts cannot be retranslated/);
  assert.match(source, /requestBackend\(`\/posts\/\$\{slug\}\/retranslate`/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /body: JSON\.stringify\(\{ locale \}\)/);
  assert.match(source, /proxyTextResponse/);
});
