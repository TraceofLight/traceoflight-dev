import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const scriptPath = new URL(
  "../src/lib/admin/new-post-page.ts",
  import.meta.url,
);
const editorBridgePath = new URL(
  "../src/lib/admin/new-post-page/editor-bridge.ts",
  import.meta.url,
);
const domPath = new URL("../src/lib/admin/new-post-page/dom.ts", import.meta.url);
const draftsPath = new URL(
  "../src/lib/admin/new-post-page/drafts.ts",
  import.meta.url,
);
const previewPath = new URL(
  "../src/lib/admin/new-post-page/preview.ts",
  import.meta.url,
);
const submitPath = new URL(
  "../src/lib/admin/new-post-page/submit.ts",
  import.meta.url,
);
const submitEventsPath = new URL(
  "../src/lib/admin/new-post-page/submit-events.ts",
  import.meta.url,
);
const draftLayerEventsPath = new URL(
  "../src/lib/admin/new-post-page/draft-layer-events.ts",
  import.meta.url,
);
const dragDropPath = new URL(
  "../src/lib/admin/new-post-page/drag-drop.ts",
  import.meta.url,
);
const uploadPath = new URL(
  "../src/lib/admin/new-post-page/upload.ts",
  import.meta.url,
);
const linkNormalizationPath = new URL(
  "../src/lib/admin/new-post-page/link-normalization.ts",
  import.meta.url,
);
const markdownPath = new URL(
  "../src/lib/admin/new-post-page/editor-markdown.ts",
  import.meta.url,
);
const feedbackPath = new URL(
  "../src/lib/admin/new-post-page/feedback.ts",
  import.meta.url,
);
const postsApiPath = new URL(
  "../src/lib/admin/new-post-page/posts-api.ts",
  import.meta.url,
);

test("writer script supports cover image drag-and-drop upload", async () => {
  const [source, domSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(domPath, "utf8"),
  ]);
  assert.match(domSource, /#writer-cover-upload-input/);
  assert.match(domSource, /#writer-cover-drop-zone/);
  assert.match(domSource, /#writer-cover-preview/);
  assert.match(source, /coverDropZone\.addEventListener\(["']dragover["']/);
  assert.match(source, /coverDropZone\.addEventListener\(["']drop["']/);
  assert.match(source, /coverPreview\.addEventListener\(["']dragover["']/);
  assert.match(source, /coverPreview\.addEventListener\(["']drop["']/);
  assert.match(source, /coverPreview\.addEventListener\(["']click["']/);
});

test("writer script updates title in preview and syncs cover preview", async () => {
  const [source, domSource, previewSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(domPath, "utf8"),
    readFile(previewPath, "utf8"),
  ]);
  assert.match(source, /previewTitle/);
  assert.doesNotMatch(source, /previewExcerpt/);
  assert.match(domSource, /#writer-cover-preview/);
  assert.match(domSource, /#writer-cover-preview-image/);
  assert.match(source, /renderCoverPreview/);
  assert.match(previewSource, /renderCoverPreview/);
  assert.doesNotMatch(source, /previewSlug/);
  assert.doesNotMatch(source, /previewCover/);
});

test("writer script starts editor with empty content and toggles empty guide state", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /createEditorBridge\(editorRoot,\s*["']["']\)/);
  assert.match(source, /data-has-content/);
  assert.match(source, /setAttribute\(\s*["']data-has-content["']/);
});

test("writer script has fallback text editor for init failure", async () => {
  const [writerSource, bridgeSource, feedbackSource, domSource] =
    await Promise.all([
      readFile(scriptPath, "utf8"),
      readFile(editorBridgePath, "utf8"),
      readFile(feedbackPath, "utf8"),
      readFile(domPath, "utf8"),
    ]);
  assert.match(writerSource, /createEditorBridge/);
  assert.match(bridgeSource, /writer-fallback-textarea/);
  assert.match(bridgeSource, /createEditorBridge/);
  assert.match(domSource, /#writer-toast/);
  assert.match(feedbackSource, /data-visible/);
});

test("writer script supports publish-layer open and confirm submit flow", async () => {
  const [
    source,
    feedbackSource,
    domSource,
    submitSource,
    submitEventsSource,
    postsApiSource,
  ] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(feedbackPath, "utf8"),
    readFile(domPath, "utf8"),
    readFile(submitPath, "utf8"),
    readFile(submitEventsPath, "utf8"),
    readFile(postsApiPath, "utf8"),
  ]);
  assert.match(domSource, /#writer-open-publish/);
  assert.match(domSource, /#writer-publish-layer/);
  assert.match(domSource, /#writer-confirm-publish/);
  assert.match(domSource, /#post-visibility/);
  assert.match(source, /from ["']\.\/new-post-page\/submit-events["']/);
  assert.match(source, /setPublishLayerOpen/);
  assert.match(source, /ensureTitleExists/);
  assert.match(source, /제목을 입력한 뒤 출간 설정을 열어 주세요/);
  assert.match(submitEventsSource, /data-submit-status/);
  assert.match(submitEventsSource, /resolveSubmitStatus/);
  assert.match(submitEventsSource, /buildSubmitPayload/);
  assert.match(submitEventsSource, /resolveSubmitRequest/);
  assert.match(submitEventsSource, /requestPostSubmit/);
  assert.match(submitSource, /resolveSubmitStatus/);
  assert.match(submitSource, /buildSubmitPayload/);
  assert.match(postsApiSource, /requestPostSubmit/);
  assert.match(postsApiSource, /content-type/);
  assert.match(feedbackSource, /post slug already exists/);
  assert.match(submitEventsSource, /suggestAvailableSlug/);
  assert.match(
    submitEventsSource,
    /const visibility:\s*PostVisibility\s*=\s*visibilityInput\.value\s*===\s*["']private["']/,
  );
  assert.match(submitEventsSource, /visibility,\s*/);
  assert.match(submitEventsSource, /window\.location\.assign\(/);
});

test("writer script validates duplicate slug with inline feedback and debounce", async () => {
  const [source, domSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(domPath, "utf8"),
  ]);
  assert.match(domSource, /#writer-slug-feedback/);
  assert.match(source, /setSlugValidationState/);
  assert.match(source, /slugCheckTimer/);
  assert.match(source, /setTimeout\([\s\S]*1000\)/);
  assert.match(source, /validateSlugAvailability/);
  assert.match(source, /aria-invalid/);
});

test("writer script can load draft by slug query", async () => {
  const [source, draftsSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(draftsPath, "utf8"),
  ]);
  assert.match(source, /readDraftSlugFromSearch/);
  assert.match(draftsSource, /new URLSearchParams\(search\)/);
  assert.match(source, /draft/);
  assert.match(source, /loadDraftBySlug/);
  assert.match(source, /editorBridge\.setMarkdown/);
});

test("writer script supports draft modal list and delete actions", async () => {
  const [source, domSource, draftsSource, draftLayerEventsSource, postsApiSource] =
    await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(domPath, "utf8"),
    readFile(draftsPath, "utf8"),
    readFile(draftLayerEventsPath, "utf8"),
    readFile(postsApiPath, "utf8"),
  ]);
  assert.match(domSource, /#writer-open-drafts/);
  assert.match(domSource, /#writer-draft-layer/);
  assert.match(domSource, /#writer-draft-list/);
  assert.match(source, /from ["']\.\/new-post-page\/draft-layer-events["']/);
  assert.match(source, /bindDraftLayerEvents/);
  assert.match(source, /loadDraftList/);
  assert.match(source, /requestDraftList/);
  assert.match(source, /requestDraftDelete/);
  assert.match(source, /setDraftLayerOpen/);
  assert.match(draftLayerEventsSource, /writer-draft-delete/);
  assert.match(postsApiSource, /\/internal-api\/posts\?status=draft&limit=100&offset=0/);
  assert.match(draftsSource, /writer-draft-delete/);
  assert.match(postsApiSource, /method:\s*["']DELETE["']/);
  assert.match(source, /updateDraftQueryParam/);
});

test("writer script delegates post network requests to posts-api module", async () => {
  const [source, submitEventsSource, postsApiSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(submitEventsPath, "utf8"),
    readFile(postsApiPath, "utf8"),
  ]);

  assert.match(source, /from ["']\.\/new-post-page\/posts-api["']/);
  assert.match(source, /requestDraftBySlug/);
  assert.match(source, /requestDraftList/);
  assert.match(source, /requestDraftDelete/);
  assert.match(source, /requestPostBySlug/);
  assert.doesNotMatch(source, /requestPostSubmit/);
  assert.match(submitEventsSource, /requestPostSubmit/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.match(postsApiSource, /fetch\(/);
});

test("writer script supports create and edit initialization modes", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /interface WriterPageInitOptions/);
  assert.match(source, /mode\?:\s*["']create["']\s*\|\s*["']edit["']/);
  assert.match(source, /options:\s*WriterPageInitOptions\s*=\s*\{\}/);
  assert.match(source, /if\s*\(mode\s*===\s*["']edit["']\)/);
  assert.match(source, /loadExistingPostBySlug/);
});

test("writer script uses milkdown replaceAll action for markdown injection", async () => {
  const source = await readFile(editorBridgePath, "utf8");
  assert.match(source, /replaceAll/);
  assert.match(source, /editor\.editor\.action\(replaceAll\(markdown\)\)/);
});

test("writer script includes target-aware drag handling and upload proxy fallback", async () => {
  const [writerSource, uploadSource, dragSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(uploadPath, "utf8"),
    readFile(dragDropPath, "utf8"),
  ]);
  assert.match(writerSource, /resolveDropTarget/);
  assert.match(dragSource, /writer-cover-preview/);
  assert.match(writerSource, /data-drop-state/);
  assert.match(writerSource, /isMediaFileDrag/);
  assert.match(dragSource, /isMediaFileDrag/);
  assert.match(uploadSource, /shouldProxyUpload/);
  assert.match(uploadSource, /\/internal-api\/media\/upload-proxy/);
  assert.match(uploadSource, /x-upload-url/);
  assert.match(uploadSource, /x-upload-content-type/);
});

test("writer script normalizes cover and markdown links", async () => {
  const [writerSource, normalizeSource, markdownSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(linkNormalizationPath, "utf8"),
    readFile(markdownPath, "utf8"),
  ]);
  assert.match(writerSource, /normalizeCoverUrl/);
  assert.match(writerSource, /normalizeMarkdownLinks/);
  assert.match(normalizeSource, /splitMarkdownDestinationAndTitle/);
  assert.match(normalizeSource, /rebuildMarkdownLinkTarget/);
  assert.match(writerSource, /sanitizeEditorMarkdown/);
  assert.match(markdownSource, /isLikelyImageScaleLine/);
  assert.match(markdownSource, /\\uFFFC/);
  assert.match(normalizeSource, /google\.com/);
});

test("writer script normalizes escaped markdown link syntax from editor output", async () => {
  const source = await readFile(linkNormalizationPath, "utf8");
  assert.match(source, /normalizeEscapedMarkdownLinks/);
  assert.match(source, /normalizeMarkdownLinkTarget/);
  assert.match(source, /https:\/\/\$\{compactUrl\}/);
});
