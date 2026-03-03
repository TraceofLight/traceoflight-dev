import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const apiPath = new URL('../src/pages/internal-api/media/upload-proxy.ts', import.meta.url);

test('media upload proxy supports binary body upload headers', async () => {
  const source = await readFile(apiPath, 'utf8');
  assert.match(source, /x-upload-url/);
  assert.match(source, /x-upload-content-type/);
  assert.match(source, /request\.arrayBuffer\(\)/);
  assert.match(source, /requestBackend\('\/media\/upload-proxy'/);
});
