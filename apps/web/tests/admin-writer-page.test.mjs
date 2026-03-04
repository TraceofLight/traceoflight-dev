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
  assert.match(source, /id="writer-bottom-bar"/);
  assert.match(source, /id="writer-open-publish"/);
  assert.match(source, /id="writer-publish-layer"/);
  assert.match(source, /id="writer-toast"/);
  assert.doesNotMatch(source, /class="writer-topbar"/);
});

test('admin writer page bootstraps writer module', async () => {
  const source = await readFile(pagePath, 'utf8');
  assert.match(source, /initNewPostAdminPage/);
});

test('admin writer page has split editor and preview layout', async () => {
  const source = await readFile(pagePath, 'utf8');
  assert.match(source, /class="writer-shell"/);
  assert.match(source, /class="writer-pane writer-pane-preview"/);
  assert.match(source, /class="writer-title-area"/);
  assert.match(source, /class="writer-pane writer-pane-editor"[\s\S]*id="writer-bottom-bar"/);
  assert.match(source, /data-has-content="false"/);
  assert.match(source, /id="writer-preview-content"/);
  assert.match(source, /id="writer-preview-title">제목 없음</);
  assert.doesNotMatch(source, /id="writer-preview-excerpt"/);
  assert.doesNotMatch(source, /요약을 입력하면 여기에 표시됩니다/);
  assert.doesNotMatch(source, /id="writer-preview-slug"/);
  assert.doesNotMatch(source, /id="writer-preview-cover"/);
  assert.doesNotMatch(source, /Lorem ipsum/);
  assert.doesNotMatch(source, /lorem-ipsum-title/);
  assert.match(source, /id="writer-editor-drop-zone"/);
  assert.match(source, /id="writer-cover-drop-zone"/);
  assert.match(source, /id="writer-cover-preview"/);
  assert.match(source, /id="writer-cover-preview-image"/);
  assert.match(source, /id="writer-cover-preview-empty"/);
  assert.match(source, /id="writer-cover-upload-input"/);
  assert.match(source, /class="writer-publish-body"/);
  assert.match(source, /class="writer-publish-column writer-publish-column-main"/);
  assert.match(source, /class="writer-publish-column writer-publish-column-side"/);
  assert.match(source, /class="writer-slug-input-wrap"/);
  assert.match(source, /class="writer-slug-prefix">\/blog\//);
  assert.match(source, /id="writer-slug-feedback"/);
  assert.match(source, /id="post-excerpt"[\s\S]*rows="7"/);
  assert.match(source, /<span>요약<\/span>/);
  assert.doesNotMatch(source, /<span>Excerpt<\/span>/);
});

test('admin writer has target-aware drop indicator styles', async () => {
  const source = await readFile(stylePath, 'utf8');
  assert.match(source, /\.writer-editor-shell\[data-drop-state='active']/);
  assert.match(source, /\.writer-field-cover-drop\[data-drop-state='active']/);
});

test('admin writer style prevents milkdown link tooltip clipping and button bleed', async () => {
  const source = await readFile(stylePath, 'utf8');
  assert.match(source, /\.writer-editor-shell \.milkdown-editor[\s\S]*overflow:\s*visible/);
  assert.match(source, /\.writer-editor-shell \.milkdown \.editor[\s\S]*max-width:\s*none/);
  assert.match(source, /\.writer-editor-shell \.milkdown \.editor[\s\S]*margin:\s*0/);
  assert.match(source, /\.writer-editor-shell \.milkdown \.milkdown-link-edit > \.link-edit > \.button/);
  assert.doesNotMatch(source, /\.writer-editor-guide/);
  assert.doesNotMatch(source, /\.writer-preview-excerpt\[data-empty='true']/);
  assert.match(source, /\.writer-cover-preview[\s\S]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(source, /\.writer-cover-preview-image[\s\S]*object-fit:\s*cover/);
  assert.match(source, /\.writer-field-feedback\[data-state='error'][\s\S]*color:\s*#b43a3a/);
});

test('admin writer has editor-side bottom bar and publish layer style', async () => {
  const source = await readFile(stylePath, 'utf8');
  assert.match(source, /\.writer-pane\.writer-pane-editor[\s\S]*position:\s*relative/);
  assert.match(source, /\.writer-pane\.writer-pane-editor \.writer-bottom-bar[\s\S]*position:\s*absolute/);
  assert.match(source, /\.writer-pane\.writer-pane-editor \.writer-bottom-bar[\s\S]*bottom:\s*0/);
  assert.match(source, /\.writer-publish-layer[\s\S]*align-items:\s*center/);
  assert.match(source, /\.writer-publish-layer[\s\S]*justify-content:\s*center/);
  assert.match(source, /\.writer-publish-panel[\s\S]*max-width:\s*980px/);
  assert.match(source, /\.writer-publish-panel[\s\S]*border-radius:\s*1\.25rem/);
  assert.match(source, /\.writer-publish-body[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+320px/);
  assert.match(source, /\.writer-publish-actions[\s\S]*border-top:\s*1px\s+solid\s+#e3e9f1/);
  assert.match(source, /\.writer-slug-input-wrap[\s\S]*display:\s*flex/);
  assert.match(source, /\.writer-publish-layer\[data-open='true']/);
  assert.match(source, /\.writer-toast[\s\S]*position:\s*fixed/);
  assert.match(source, /\.writer-toast[\s\S]*right:\s*1\.2rem/);
  assert.match(source, /\.writer-toast[\s\S]*bottom:\s*1\.2rem/);
});
