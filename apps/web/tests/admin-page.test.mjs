import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const pagePath = new URL('../src/pages/admin/index.astro', import.meta.url);

test('admin dashboard keeps navigation and logout without draft list', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /Go to Writer/);
  assert.match(source, /href="\/admin\/logout"/);
  assert.doesNotMatch(source, /admin-logout-button/);
  assert.doesNotMatch(source, /initializeAdminLogout/);
  assert.doesNotMatch(source, /id="admin-draft-list"/);
  assert.doesNotMatch(source, /admin-draft-delete/);
  assert.doesNotMatch(source, /status=draft/);
});
