import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const scriptPath = new URL('../src/lib/admin/new-post-page.ts', import.meta.url);

test('writer script supports cover image drag-and-drop upload', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /coverInput\.addEventListener\('dragover'/);
  assert.match(source, /coverInput\.addEventListener\('drop'/);
});

test('writer script updates slug and cover in preview', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /previewSlug/);
  assert.match(source, /previewCover/);
});

test('writer script has fallback text editor for init failure', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /writer-fallback-textarea/);
  assert.match(source, /createEditorBridge/);
});

test('writer script includes global drag overlay and upload proxy fallback', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /writer-drop-overlay/);
  assert.match(source, /isMediaFileDrag/);
  assert.match(source, /shouldProxyUpload/);
  assert.match(source, /\/internal-api\/media\/upload-proxy/);
  assert.match(source, /x-upload-url/);
  assert.match(source, /x-upload-content-type/);
});

test('writer script normalizes cover and markdown links', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /normalizeCoverUrl/);
  assert.match(source, /normalizeMarkdownLinks/);
  assert.match(source, /google\.com/);
});
