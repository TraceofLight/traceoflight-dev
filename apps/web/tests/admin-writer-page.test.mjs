import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const pagePath = new URL('../src/pages/admin/posts/new.astro', import.meta.url);

test('admin writer page renders post form shell', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /id="admin-post-form"/);
  assert.match(source, /id="milkdown-editor"/);
  assert.match(source, /id="writer-upload-trigger"/);
});

test('admin writer page bootstraps writer module', async () => {
  const source = await readFile(pagePath, 'utf8');
  assert.match(source, /initNewPostAdminPage/);
});

test('admin writer page has split editor and preview layout', async () => {
  const source = await readFile(pagePath, 'utf8');
  assert.match(source, /class="writer-shell"/);
  assert.match(source, /class="writer-pane writer-pane-preview"/);
  assert.match(source, /id="writer-preview-content"/);
  assert.match(source, /id="writer-preview-slug"/);
  assert.match(source, /id="writer-preview-cover"/);
});
