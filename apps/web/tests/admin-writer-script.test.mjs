import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const scriptPath = new URL('../src/lib/admin/new-post-page.ts', import.meta.url);

test('writer script supports cover image drag-and-drop upload', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /coverDropZone\.addEventListener\('dragover'/);
  assert.match(source, /coverDropZone\.addEventListener\('drop'/);
});

test('writer script updates title in preview and syncs cover preview', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /previewTitle/);
  assert.doesNotMatch(source, /previewExcerpt/);
  assert.match(source, /writer-cover-preview/);
  assert.match(source, /writer-cover-preview-image/);
  assert.match(source, /renderCoverPreview/);
  assert.doesNotMatch(source, /previewSlug/);
  assert.doesNotMatch(source, /previewCover/);
});

test('writer script starts editor with empty content and toggles empty guide state', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /createEditorBridge\(editorRoot,\s*''\)/);
  assert.match(source, /data-has-content/);
  assert.match(source, /setAttribute\('data-has-content'/);
});

test('writer script has fallback text editor for init failure', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /writer-fallback-textarea/);
  assert.match(source, /createEditorBridge/);
  assert.match(source, /#writer-toast/);
  assert.match(source, /data-visible/);
});

test('writer script supports publish-layer open and confirm submit flow', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /#writer-open-publish/);
  assert.match(source, /#writer-publish-layer/);
  assert.match(source, /#writer-confirm-publish/);
  assert.match(source, /setPublishLayerOpen/);
  assert.match(source, /data-submit-status/);
  assert.match(source, /post slug already exists/);
  assert.match(source, /suggestAvailableSlug/);
});

test('writer script uses milkdown replaceAll action for markdown injection', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /replaceAll/);
  assert.match(source, /editor\.editor\.action\(replaceAll\(markdown\)\)/);
});

test('writer script includes target-aware drag handling and upload proxy fallback', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /resolveDropTarget/);
  assert.match(source, /data-drop-state/);
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
  assert.match(source, /sanitizeEditorMarkdown/);
  assert.match(source, /isLikelyImageScaleLine/);
  assert.match(source, /\\uFFFC/);
  assert.match(source, /google\.com/);
});

test('writer script normalizes escaped markdown link syntax from editor output', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /normalizeEscapedMarkdownLinks/);
  assert.match(source, /normalizeMarkdownLinkTarget/);
  assert.match(source, /https:\/\/\$\{compactUrl\}/);
});
