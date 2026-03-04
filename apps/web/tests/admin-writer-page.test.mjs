import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const pagePath = new URL('../src/pages/admin/posts/new.astro', import.meta.url);
const stylePath = new URL('../src/styles/components.css', import.meta.url);

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
  assert.match(source, /id="writer-editor-drop-zone"/);
  assert.match(source, /id="writer-cover-drop-zone"/);
});

test('admin writer has target-aware drop indicator styles', async () => {
  const source = await readFile(stylePath, 'utf8');
  assert.match(source, /\.writer-editor-shell\[data-drop-state='active']/);
  assert.match(source, /\.writer-field-cover-drop\[data-drop-state='active']/);
});

test('admin writer style prevents milkdown link tooltip clipping and button bleed', async () => {
  const source = await readFile(stylePath, 'utf8');
  assert.match(source, /\.writer-editor-shell \.milkdown-editor[\s\S]*overflow:\s*visible/);
  assert.match(source, /\.writer-editor-shell \.milkdown \.milkdown-link-edit > \.link-edit > \.button/);
});
