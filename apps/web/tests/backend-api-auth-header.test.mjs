import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const backendApiPath = new URL('../src/lib/backend-api.ts', import.meta.url);

test('backend api helper attaches internal shared secret header when configured', async () => {
  const source = await readFile(backendApiPath, 'utf8');

  assert.match(source, /INTERNAL_API_SECRET/);
  assert.match(source, /x-internal-api-secret/);
  assert.match(source, /headers:\s*buildBackendRequestHeaders\(init\?\.headers,\s*includeInternalSecret\)/);
  assert.match(source, /export async function requestBackendPublic/);
});
