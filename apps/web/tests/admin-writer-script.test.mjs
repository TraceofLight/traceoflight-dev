import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const scriptPath = new URL('../src/lib/admin/new-post-page.ts', import.meta.url);

test('writer script supports cover image drag-and-drop upload', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /#writer-cover-upload-input/);
  assert.match(source, /coverDropZone\.addEventListener\('dragover'/);
  assert.match(source, /coverDropZone\.addEventListener\('drop'/);
  assert.match(source, /coverPreview\.addEventListener\('dragover'/);
  assert.match(source, /coverPreview\.addEventListener\('drop'/);
  assert.match(source, /coverPreview\.addEventListener\('click'/);
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
  assert.match(source, /#post-visibility/);
  assert.match(source, /setPublishLayerOpen/);
  assert.match(source, /ensureTitleExists/);
  assert.match(source, /제목을 입력한 뒤 출간 설정을 열어 주세요/);
  assert.match(source, /data-submit-status/);
  assert.match(source, /post slug already exists/);
  assert.match(source, /suggestAvailableSlug/);
  assert.match(source, /const visibility:\s*PostVisibility\s*=\s*visibilityInput\.value\s*===\s*'private'/);
  assert.match(source, /visibility,\s*/);
  assert.match(source, /window\.location\.assign\(/);
});

test('writer script validates duplicate slug with inline feedback and debounce', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /#writer-slug-feedback/);
  assert.match(source, /setSlugValidationState/);
  assert.match(source, /slugCheckTimer/);
  assert.match(source, /setTimeout\([\s\S]*1000\)/);
  assert.match(source, /validateSlugAvailability/);
  assert.match(source, /aria-invalid/);
});

test('writer script can load draft by slug query', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(source, /draft/);
  assert.match(source, /loadDraftBySlug/);
  assert.match(source, /editorBridge\.setMarkdown/);
});

test('writer script supports draft modal list and delete actions', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /#writer-open-drafts/);
  assert.match(source, /#writer-draft-layer/);
  assert.match(source, /#writer-draft-list/);
  assert.match(source, /loadDraftList/);
  assert.match(source, /setDraftLayerOpen/);
  assert.match(source, /\/internal-api\/posts\?status=draft&limit=100&offset=0/);
  assert.match(source, /writer-draft-delete/);
  assert.match(source, /method:\s*'DELETE'/);
  assert.match(source, /updateDraftQueryParam/);
});

test('writer script uses milkdown replaceAll action for markdown injection', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /replaceAll/);
  assert.match(source, /editor\.editor\.action\(replaceAll\(markdown\)\)/);
});

test('writer script includes target-aware drag handling and upload proxy fallback', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /resolveDropTarget/);
  assert.match(source, /writer-cover-preview/);
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
  assert.match(source, /splitMarkdownDestinationAndTitle/);
  assert.match(source, /normalizeMarkdownLinkRawTarget/);
  assert.match(source, /rebuildMarkdownLinkTarget/);
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
