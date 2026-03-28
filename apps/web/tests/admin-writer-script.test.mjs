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
const loadersPath = new URL(
  "../src/lib/admin/new-post-page/loaders.ts",
  import.meta.url,
);
const mediaControllerPath = new URL(
  "../src/lib/admin/new-post-page/media-controller.ts",
  import.meta.url,
);

test("writer script supports cover image drag-and-drop upload", async () => {
  const [source, domSource, mediaControllerSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(domPath, "utf8"),
    readFile(mediaControllerPath, "utf8"),
  ]);
  assert.match(domSource, /#writer-cover-upload-input/);
  assert.match(domSource, /#writer-cover-drop-zone/);
  assert.match(domSource, /#writer-cover-preview/);
  assert.match(domSource, /#writer-top-media-upload-trigger/);
  assert.match(domSource, /#writer-top-media-upload-input/);
  assert.match(domSource, /#writer-top-media-preview-video/);
  assert.match(source, /from ["']\.\/new-post-page\/media-controller["']/);
  assert.match(source, /bindWriterMediaInteractions/);
  assert.match(mediaControllerSource, /coverDropZone\.addEventListener\(["']dragover["']/);
  assert.match(mediaControllerSource, /coverDropZone\.addEventListener\(["']drop["']/);
  assert.match(mediaControllerSource, /coverPreview\.addEventListener\(["']dragover["']/);
  assert.match(mediaControllerSource, /coverPreview\.addEventListener\(["']drop["']/);
  assert.match(mediaControllerSource, /coverPreview\.addEventListener\(["']click["']/);
  assert.match(mediaControllerSource, /topMediaUploadTrigger/);
  assert.match(mediaControllerSource, /topMediaUploadInput/);
  assert.match(mediaControllerSource, /uploadOneFileToTopMediaVideo/);
});

test("writer script updates title in preview and syncs cover preview", async () => {
  const [source, domSource, previewSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(domPath, "utf8"),
    readFile(previewPath, "utf8"),
  ]);
  assert.match(source, /previewTitle/);
  assert.match(source, /previewMetaKinds/);
  assert.match(source, /previewMetaSeries/);
  assert.match(source, /previewMetaProject/);
  assert.match(source, /previewMetaHighlights/);
  assert.match(source, /previewMetaLinks/);
  assert.match(domSource, /#writer-preview-meta/);
  assert.match(domSource, /#writer-preview-meta-kinds/);
  assert.match(domSource, /#writer-preview-meta-series/);
  assert.match(domSource, /#writer-preview-meta-project/);
  assert.match(domSource, /#writer-preview-meta-highlights/);
  assert.match(domSource, /#writer-preview-meta-links/);
  assert.match(source, /syncTopMediaUi/);
  assert.match(source, /topMediaPreviewImage/);
  assert.match(source, /topMediaPreviewFrame/);
  assert.match(source, /topMediaPreviewVideo/);
  assert.match(source, /topMediaPreviewEmpty/);
  assert.match(source, /topMediaPreview\.setAttribute\("data-empty", "true"\)/);
  assert.doesNotMatch(domSource, /#writer-preview-top-media/);
  assert.doesNotMatch(source, /previewExcerpt/);
  assert.match(domSource, /#writer-cover-preview/);
  assert.match(domSource, /#writer-cover-preview-image/);
  assert.match(source, /renderCoverPreview/);
  assert.match(previewSource, /renderCoverPreview/);
  assert.match(previewSource, /주요 항목 입력 전입니다/);
  assert.match(previewSource, /관련 링크 입력 전입니다/);
  assert.doesNotMatch(previewSource, /요약 입력 전입니다/);
  assert.doesNotMatch(previewSource, /태그 입력 전입니다/);
  assert.doesNotMatch(source, /syncPreviewSectionHeights/);
  assert.doesNotMatch(source, /new ResizeObserver/);
  assert.doesNotMatch(source, /previewHead\.style\.height/);
  assert.doesNotMatch(source, /previewMeta\.style\.height/);
  assert.doesNotMatch(source, /previewSlug/);
  assert.doesNotMatch(source, /previewCover/);
  assert.doesNotMatch(domSource, /#writer-upload-trigger/);
  assert.doesNotMatch(domSource, /#writer-upload-input/);
});

test("writer script starts editor with empty content and toggles empty guide state", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(
    source,
    /const initialMarkdown = initialPayload\?\.body_markdown \?\? ["']["'];/,
  );
  assert.match(source, /createEditorBridge\(editorRoot,\s*initialMarkdown\)/);
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
  assert.match(bridgeSource, /withTimeout/);
  assert.match(bridgeSource, /Milkdown runtime loading timed out/);
  assert.match(bridgeSource, /Milkdown editor initialization timed out/);
  assert.match(bridgeSource, /await import\(["']@milkdown\/crepe["']\)/);
  assert.match(bridgeSource, /await import\(["']@milkdown\/utils["']\)/);
  assert.doesNotMatch(
    bridgeSource,
    /await import\(["']@milkdown\/crepe\/theme\/common\/style\.css["']\)/,
  );
  assert.doesNotMatch(
    bridgeSource,
    /await import\(["']@milkdown\/crepe\/theme\/nord\.css["']\)/,
  );
  assert.doesNotMatch(bridgeSource, /import \{ Crepe \} from ["']@milkdown\/crepe["']/);
  assert.match(domSource, /#writer-toast/);
  assert.match(feedbackSource, /data-visible/);
  assert.match(writerSource, /Promise<boolean>/);
  assert.match(writerSource, /if \(!dom\) return false;/);
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
  assert.match(domSource, /#writer-reauth-layer/);
  assert.match(domSource, /#writer-reauth-form/);
  assert.match(domSource, /#writer-reauth-username/);
  assert.match(domSource, /#writer-reauth-password/);
  assert.match(domSource, /#writer-reauth-confirm/);
  assert.match(domSource, /#writer-reauth-cancel/);
  assert.match(domSource, /#writer-confirm-publish/);
  assert.match(domSource, /#post-content-kind/);
  assert.match(domSource, /#writer-project-fields/);
  assert.match(domSource, /#project-period/);
  assert.match(domSource, /#project-role-summary/);
  assert.match(domSource, /#project-intro/);
  assert.match(domSource, /#project-highlights/);
  assert.match(domSource, /#project-resource-links/);
  assert.match(domSource, /#writer-top-media-kind/);
  assert.match(domSource, /#writer-top-media-image-url/);
  assert.match(domSource, /#writer-top-media-youtube-url/);
  assert.match(domSource, /#writer-top-media-video-url/);
  assert.match(domSource, /#writer-top-media-upload-trigger/);
  assert.match(domSource, /#writer-top-media-upload-input/);
  assert.match(domSource, /#post-visibility/);
  assert.match(domSource, /#post-series/);
  assert.match(domSource, /#writer-series-suggestions/);
  assert.match(source, /from ["']\.\/new-post-page\/submit-events["']/);
  assert.match(source, /setPublishLayerOpen/);
  assert.match(source, /ensureTitleExists/);
  assert.match(source, /제목을 입력한 뒤 출간 설정을 열어 주세요/);
  assert.match(submitEventsSource, /data-submit-status/);
  assert.match(submitEventsSource, /resolveSubmitStatus/);
  assert.match(submitEventsSource, /buildSubmitPayload/);
  assert.match(submitEventsSource, /resolveSubmitRequest/);
  assert.match(submitEventsSource, /requestPostSubmit/);
  assert.match(submitEventsSource, /requestAdminLogin/);
  assert.match(submitEventsSource, /submitResult\.status === 401/);
  assert.match(submitEventsSource, /setReauthLayerOpen\(true\)/);
  assert.match(submitEventsSource, /pendingPublishRetry/);
  assert.match(submitEventsSource, /seriesInput\.value\.trim/);
  assert.match(submitEventsSource, /seriesTitle:\s*seriesName/);
  assert.match(submitEventsSource, /contentKind:/);
  assert.match(submitEventsSource, /projectPeriod:/);
  assert.match(submitEventsSource, /projectIntro:/);
  assert.match(submitEventsSource, /topMediaKind:/);
  assert.match(submitEventsSource, /topMediaImageUrl:/);
  assert.match(submitEventsSource, /topMediaYoutubeUrl:/);
  assert.match(submitEventsSource, /topMediaVideoUrl:/);
  assert.match(submitSource, /resolveSubmitStatus/);
  assert.match(submitSource, /buildSubmitPayload/);
  assert.match(submitSource, /content_kind/);
  assert.match(submitSource, /top_media_kind/);
  assert.match(submitSource, /top_media_image_url/);
  assert.match(submitSource, /top_media_youtube_url/);
  assert.match(submitSource, /top_media_video_url/);
  assert.match(submitSource, /project_profile/);
  assert.match(submitSource, /project_intro/);
  assert.doesNotMatch(submitSource, /detail_media_kind/);
  assert.doesNotMatch(submitSource, /detail_video_url/);
  assert.doesNotMatch(submitEventsSource, /projectDetailImageUrl:/);
  assert.doesNotMatch(domSource, /#project-detail-media-kind/);
  assert.doesNotMatch(domSource, /#project-detail-image-url/);
  assert.match(submitSource, /series_title/);
  assert.match(postsApiSource, /requestPostSubmit/);
  assert.match(postsApiSource, /requestAdminLogin/);
  assert.match(postsApiSource, /requestSeriesList/);
  assert.match(postsApiSource, /content_kind/);
  assert.match(postsApiSource, /project_profile/);
  assert.match(postsApiSource, /\/internal-api\/series/);
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
  const [source, draftsSource, loadersSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(draftsPath, "utf8"),
    readFile(loadersPath, "utf8"),
  ]);
  assert.match(source, /createWriterLoaders/);
  assert.match(loadersSource, /readDraftSlugFromSearch/);
  assert.match(draftsSource, /new URLSearchParams\(search\)/);
  assert.match(loadersSource, /draft/);
  assert.match(loadersSource, /loadDraftBySlug/);
  assert.match(loadersSource, /projectIntroInput/);
  assert.match(loadersSource, /topMediaKindInput/);
  assert.match(loadersSource, /topMediaImageUrlInput/);
  assert.match(loadersSource, /topMediaYoutubeUrlInput/);
  assert.match(loadersSource, /topMediaVideoUrlInput/);
  assert.doesNotMatch(loadersSource, /projectDetailImageUrlInput/);
  assert.match(loadersSource, /editorBridge\.setMarkdown/);
});

test("writer draft helpers normalize the posts array and keep only the public api exports", async () => {
  const draftsSource = await readFile(draftsPath, "utf8");

  assert.match(draftsSource, /function getTrimmedTitle\(post: AdminDraftListItem\)/);
  assert.match(draftsSource, /function formatDraftDateLabel\(isoValue: string \| null \| undefined\)/);
  assert.match(draftsSource, /function buildDraftMetaLabel\(post: AdminDraftListItem\)/);
  assert.match(draftsSource, /return posts\s*\.filter\(/);
  assert.doesNotMatch(draftsSource, /return post\s*\.filter\(/);
  assert.match(draftsSource, /\.sort\(\(left,\s*right\) =>/);
  assert.doesNotMatch(draftsSource, /export function formatDateLabel/);
  assert.doesNotMatch(draftsSource, /export function buildDraftMetaLabel/);
});

test("writer script supports draft modal list and delete actions", async () => {
  const [source, domSource, draftsSource, draftLayerEventsSource, postsApiSource, loadersSource] =
    await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(domPath, "utf8"),
    readFile(draftsPath, "utf8"),
    readFile(draftLayerEventsPath, "utf8"),
    readFile(postsApiPath, "utf8"),
    readFile(loadersPath, "utf8"),
  ]);
  assert.match(domSource, /#writer-open-drafts/);
  assert.match(domSource, /#writer-draft-layer/);
  assert.match(domSource, /#writer-draft-list/);
  assert.match(source, /from ["']\.\/new-post-page\/draft-layer-events["']/);
  assert.match(source, /from ["']\.\/new-post-page\/loaders["']/);
  assert.match(source, /createWriterLoaders/);
  assert.match(source, /bindDraftLayerEvents/);
  assert.match(loadersSource, /loadDraftList/);
  assert.match(loadersSource, /requestDraftList/);
  assert.match(source, /requestDraftDelete/);
  assert.match(source, /setDraftLayerOpen/);
  assert.match(draftLayerEventsSource, /writer-draft-delete/);
  assert.match(postsApiSource, /\/internal-api\/posts\?status=draft&limit=100&offset=0/);
  assert.match(draftsSource, /writer-draft-delete/);
  assert.match(postsApiSource, /method:\s*["']DELETE["']/);
  assert.match(source, /updateDraftQueryParam/);
});

test("writer script delegates tag, series, and draft loading to the loader factory", async () => {
  const [source, loadersSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(loadersPath, "utf8"),
  ]);

  assert.match(source, /from ["']\.\/new-post-page\/loaders["']/);
  assert.match(source, /createWriterLoaders/);
  assert.doesNotMatch(source, /const loadTagSuggestions = async/);
  assert.doesNotMatch(source, /const loadSeriesSuggestions = async/);
  assert.doesNotMatch(source, /const loadDraftList = async/);
  assert.match(loadersSource, /loadTagSuggestions/);
  assert.match(loadersSource, /loadSeriesSuggestions/);
  assert.match(loadersSource, /loadDraftList/);
});

test("writer script delegates post network requests to posts-api module", async () => {
  const [source, submitEventsSource, postsApiSource, loadersSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(submitEventsPath, "utf8"),
    readFile(postsApiPath, "utf8"),
    readFile(loadersPath, "utf8"),
  ]);

  assert.match(source, /from ["']\.\/new-post-page\/posts-api["']/);
  assert.match(loadersSource, /requestDraftBySlug/);
  assert.match(loadersSource, /requestDraftList/);
  assert.match(source, /requestDraftDelete/);
  assert.match(loadersSource, /requestPostBySlug/);
  assert.doesNotMatch(source, /requestPostSubmit/);
  assert.match(submitEventsSource, /requestPostSubmit/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.match(postsApiSource, /fetch\(/);
});

test("writer script supports create and edit initialization modes", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /interface WriterPageInitOptions/);
  assert.match(source, /mode\?:\s*["']create["']\s*\|\s*["']edit["']/);
  assert.match(source, /contentKind\?:\s*PostContentKind/);
  assert.match(source, /options:\s*WriterPageInitOptions\s*=\s*\{\}/);
  assert.match(source, /function resolveInitialContentKind/);
  assert.match(source, /const initialContentKind = resolveInitialContentKind/);
  assert.match(source, /contentKindInput\.value = initialContentKind/);
  assert.match(source, /if\s*\(mode\s*===\s*["']edit["']\)/);
  assert.match(source, /loadExistingPostBySlug/);
});

test("writer script uses milkdown replaceAll action for markdown injection", async () => {
  const source = await readFile(editorBridgePath, "utf8");
  assert.match(source, /replaceAll/);
  assert.match(source, /editor\.editor\.action\(replaceAll\(markdown\)\)/);
});

test("writer script includes target-aware drag handling and upload proxy fallback", async () => {
  const [writerSource, uploadSource, dragSource, mediaControllerSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(uploadPath, "utf8"),
    readFile(dragDropPath, "utf8"),
    readFile(mediaControllerPath, "utf8"),
  ]);
  assert.match(writerSource, /bindWriterMediaInteractions/);
  assert.match(dragSource, /writer-cover-preview/);
  assert.match(writerSource, /data-drop-state/);
  assert.match(mediaControllerSource, /resolveDropTarget/);
  assert.match(mediaControllerSource, /isMediaFileDrag/);
  assert.match(mediaControllerSource, /file\.type\.startsWith\(["']video\/["']\)/);
  assert.match(dragSource, /isMediaFileDrag/);
  assert.match(dragSource, /if \(files && files\.length > 0\)/);
  assert.match(dragSource, /if \(!mime\) return false/);
  assert.doesNotMatch(mediaControllerSource, /writer-upload-trigger/);
  assert.doesNotMatch(mediaControllerSource, /writer-upload-input/);
  assert.match(uploadSource, /shouldProxyUpload/);
  assert.match(uploadSource, /\/internal-api\/media\/upload-proxy/);
  assert.match(uploadSource, /x-upload-url/);
  assert.match(uploadSource, /x-upload-content-type/);
});

test("writer media controller blocks background drops while modal layers are active", async () => {
  const [writerSource, mediaControllerSource] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(mediaControllerPath, "utf8"),
  ]);

  assert.match(writerSource, /const isModalInteractionActive = \(\) =>/);
  assert.match(
    writerSource,
    /isDraftLayerOpen\(\)\s*\|\|\s*isPublishLayerOpen\(\)\s*\|\|\s*isReauthLayerOpen\(\)/,
  );
  assert.match(
    writerSource,
    /bindWriterMediaInteractions\(\{[\s\S]*isModalInteractionActive,/,
  );
  assert.match(mediaControllerSource, /isModalInteractionActive: \(\) => boolean;/);
  assert.match(
    mediaControllerSource,
    /if \(isModalInteractionActive\(\) && dropTarget !== "cover"\) \{/,
  );
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

test("writer submit status does not promote submitter-null submits to published", async () => {
  const submitSource = await readFile(submitPath, "utf8");

  assert.match(
    submitSource,
    /if \(desiredStatus === "published"\) return "published";/,
  );
  assert.doesNotMatch(
    submitSource,
    /if \(submitterIsNull && publishLayerOpen\) return "published";/,
  );
});

test("writer series input blocks Enter from submitting the form", async () => {
  const source = await readFile(scriptPath, "utf8");

  assert.match(source, /seriesInput\.addEventListener\("keydown", \(event\) => \{/);
  assert.match(
    source,
    /seriesInput\.addEventListener\("keydown",[\s\S]*event\.key === "Enter"/,
  );
  assert.match(
    source,
    /seriesInput\.addEventListener\("keydown",[\s\S]*event\.preventDefault\(\)/,
  );
});
