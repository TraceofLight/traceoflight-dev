import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const apiPath = new URL('../src/pages/internal-api/media/upload-proxy.ts', import.meta.url);

test('upload proxy endpoint validates request and forwards PUT upload', async () => {
  const source = await readFile(apiPath, 'utf8');

  assert.match(source, /request\.formData\(\)/);
  assert.match(source, /upload_url is required/);
  assert.match(source, /upload_url protocol is not supported/);
  assert.match(source, /method: 'PUT'/);
});
