import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const bySlugPath = new URL('../src/pages/internal-api/posts/[slug].ts', import.meta.url);

test('internal-api posts by slug route supports get, put, delete proxy', async () => {
  const source = await readFile(bySlugPath, 'utf8');

  assert.match(source, /export const GET/);
  assert.match(source, /export const PUT/);
  assert.match(source, /export const DELETE/);
  assert.match(source, /requestBackend\(`\/posts\/\$\{slug}\$\{query\}`/);
});
